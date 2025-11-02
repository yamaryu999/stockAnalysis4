"""Daily ingest job entrypoint."""
from __future__ import annotations

import csv
import io
import json
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Sequence

import requests
from bs4 import BeautifulSoup

from .adapters.earnings_adapter import EarningsAdapter
from .adapters.news_adapter import NewsAdapter
from .adapters.price_adapter import PriceAdapter, PriceBar
from .adapters.tdnet_rss_adapter import TdnetRssAdapter
from .features import FeatureCalculator, FeatureRecord
from .rules import DetectedEvent, detect_earnings, detect_news, detect_tdnet, detect_volume_spike, to_feature_map
from .scoring import ScoreComponents, calculate_score, load_weights
from .utils.db import clear_table, replace_many, sqlite_conn
from .utils.env import load_env

ROOT = Path(__file__).resolve().parents[2]


def read_symbols_local() -> List[Dict[str, str]]:
    """Read fallback symbols from the local sample CSV."""
    symbols_path = ROOT / "data" / "sample" / "symbols.csv"
    if not symbols_path.exists():
        return []
    with symbols_path.open("r", encoding="utf-8") as fp:
        reader = csv.DictReader(fp)
        return list(reader)


def fetch_text(session: requests.Session, url: str, timeout: int = 15) -> str:
    resp = session.get(url, timeout=timeout)
    resp.raise_for_status()
    if resp.encoding is None:
        resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


def resolve_symbol_names(
    session: requests.Session,
    codes: Sequence[str],
    env: Mapping[str, str],
) -> Dict[str, str]:
    template = env.get("SYMBOL_PROFILE_URL_TEMPLATE", "https://kabutan.jp/stock/?code={code}")
    headers = {"User-Agent": env.get("HTTP_USER_AGENT", "kabu4-ingest/1.0")}
    result: Dict[str, str] = {}
    for code in codes:
        url = template.format(code=code)
        try:
            resp = session.get(url, timeout=15, headers=headers)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")
            title_tag = soup.find("title")
            if title_tag and "【" in title_tag.text:
                name = title_tag.text.split("【", 1)[0].strip()
                result[code] = name if name else code
                continue
        except Exception:
            pass
        result[code] = code
    return result


def fetch_web_symbols(
    env: Mapping[str, str],
    recent_events: List[DetectedEvent],
    session: requests.Session,
) -> List[Dict[str, str]]:
    """Try to resolve symbols from the internet.

    Strategy (in order):
    - SYMBOLS_CSV_URL: CSV with headers code,name[,sector]
    - SYMBOLS_JSON_URL: JSON array of {code,name,sector?} or [code,...]
    - TDNET_RSS_URL (HTML page): extract 4-digit codes from page text
    - Fallback to codes seen in recent_events (name omitted)
    """
    csv_url = env.get("SYMBOLS_CSV_URL")
    json_url = env.get("SYMBOLS_JSON_URL")
    tdnet_url = env.get("TDNET_RSS_URL")

    # CSV source
    if csv_url:
        try:
            raw = fetch_text(session, csv_url)
            buf = io.StringIO(raw)
            reader = csv.DictReader(buf)
            out: List[Dict[str, str]] = []
            for row in reader:
                code = (row.get("code") or "").strip()
                if not code:
                    continue
                out.append({
                    "code": code,
                    "name": (row.get("name") or code).strip(),
                    "sector": (row.get("sector") or None) or None,
                })
            if out:
                return out
        except Exception:
            pass

    # JSON source
    if json_url:
        try:
            raw = fetch_text(session, json_url)
            data = json.loads(raw)
            out: List[Dict[str, str]] = []
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, str):
                        out.append({"code": item, "name": item})
                    elif isinstance(item, dict):
                        code = str(item.get("code") or "").strip()
                        if not code:
                            continue
                        out.append({
                            "code": code,
                            "name": str(item.get("name") or code).strip(),
                            "sector": item.get("sector"),
                        })
            if out:
                return out
        except Exception:
            pass

    # TDNET page codes
    if tdnet_url:
        try:
            html = fetch_text(session, tdnet_url)
            # Extract 4-digit codes that likely represent JP equity codes
            codes = sorted({m.group(0) for m in re.finditer(r"(?<!\d)(\d{4})(?!\d)", html)})
            if codes:
                names = resolve_symbol_names(session, codes, env)
                return [
                    {
                        "code": c,
                        "name": names.get(c, c),
                    }
                    for c in codes
                ]
        except Exception:
            pass

    # Fallback: any codes from recent events
    codes = sorted({ev.code for ev in recent_events if ev.code})
    if not codes:
        return []
    names = resolve_symbol_names(session, codes, env)
    return [{"code": c, "name": names.get(c, c)} for c in codes]


def upsert_symbols(conn, symbols: Iterable[Mapping[str, str]]) -> None:
    rows = [(row["code"], row["name"], row.get("sector")) for row in symbols]
    replace_many(conn, "Symbol", ("code", "name", "sector"), rows)


def upsert_prices(conn, prices: Mapping[str, List[PriceBar]]) -> None:
    rows = []
    for code, bars in prices.items():
        for bar in bars:
            dt = datetime.combine(bar.trading_date, datetime.min.time(), tzinfo=timezone.utc)
            rows.append(
                (
                    code,
                    dt.isoformat(),
                    f"{bar.open:.2f}",
                    f"{bar.high:.2f}",
                    f"{bar.low:.2f}",
                    f"{bar.close:.2f}",
                    bar.volume,
                    f"{bar.vwap:.2f}" if bar.vwap is not None else None,
                )
            )
    replace_many(
        conn,
        "DailyPrice",
        ("code", "date", "open", "high", "low", "close", "volume", "vwap"),
        rows,
    )


def upsert_features(conn, features: Iterable[FeatureRecord]) -> None:
    rows = [
        (
            feature.code,
            datetime.fromisoformat(feature.date).replace(tzinfo=timezone.utc).isoformat(),
            feature.name,
            feature.value,
        )
        for feature in features
    ]
    replace_many(conn, "Feature", ("code", "date", "name", "value"), rows)


def upsert_events(conn, events: Iterable[DetectedEvent]) -> None:
    rows = []
    for event in events:
        event_id = f"{event.code}-{event.date.date().isoformat()}-{event.tag}-{event.source}"
        # Store as epoch milliseconds to stay consistent with Prisma's SQLite representation
        epoch_ms = int(event.date.timestamp() * 1000)
        rows.append(
            (
                event_id,
                event.code,
                epoch_ms,
                event.type,
                event.title,
                event.summary,
                event.source,
                event.score_raw,
            )
        )
    replace_many(
        conn,
        "CorporateEvent",
        ("id", "code", "date", "type", "title", "summary", "source", "scoreRaw"),
        rows,
    )


def build_daily_picks(
    weights_env: Mapping[str, str],
    prices: Mapping[str, List[PriceBar]],
    features: Iterable[FeatureRecord],
    events: List[DetectedEvent],
) -> List[Dict[str, object]]:
    weights = load_weights(weights_env)
    feature_map = to_feature_map(features)
    price_dates = [bar.trading_date for price_list in prices.values() for bar in price_list]
    event_dates = [ev.date.date() for ev in events]
    candidate_dates = price_dates + event_dates
    latest_date = max(candidate_dates) if candidate_dates else date.today()
    latest_iso = latest_date.isoformat()

    events_by_code: Dict[str, List[DetectedEvent]] = defaultdict(list)
    for event in events:
        events_by_code[event.code].append(event)

    price_lookup: Dict[str, Dict[str, PriceBar]] = defaultdict(dict)
    for code, price_list in prices.items():
        for bar in price_list:
            price_lookup[code][bar.trading_date.isoformat()] = bar

    picks: List[Dict[str, object]] = []

    codes = sorted(set(price_lookup.keys()) | set(events_by_code.keys()))

    for code in codes:
        price_list = price_lookup.get(code, {})
        bar = price_list.get(latest_iso)
        daily_features = feature_map.get(code, {}).get(latest_iso, {})
        if daily_features:
            metrics = {
                "volume_z": daily_features.get("volume_z"),
                "gap_pct": daily_features.get("gap_pct"),
                "supply_demand_proxy": daily_features.get("supply_demand_proxy"),
            }
            filters = {
                "high20d_dist_pct": daily_features.get("high20d_dist_pct"),
                "close": getattr(bar, "close", None),
            }
        else:
            metrics = {
                "volume_z": None,
                "gap_pct": None,
                "supply_demand_proxy": None,
            }
            filters = {
                "high20d_dist_pct": None,
                "close": getattr(bar, "close", None),
            }
        penalty = {
            "recent_negative": recent_negative_penalty(events_by_code.get(code, []), latest_date)
        }
        # Consider recent events within a wider lookback window to ensure
        # scoring reflects nearby catalysts in small sample datasets.
        candidate_events = [
            ev
            for ev in events_by_code.get(code, [])
            if ev.date.date() <= latest_date and ev.date.date() >= latest_date - timedelta(days=10)
        ]
        score = calculate_score(weights, candidate_events, metrics, filters, penalty)
        if score.normalized >= weights.minScore:
            picks.append(
                {
                    "date": latest_iso,
                    "code": code,
                    "score": score,
                    "close": getattr(bar, "close", None),
                    "metrics": metrics,
                    "filters": filters,
                    "events": candidate_events,
                    "penalty": penalty,
                }
            )
    return picks


def recent_negative_penalty(events: Iterable[DetectedEvent], latest: date) -> float:
    penalty = 0.0
    for event in events:
        if event.tag == "NEWS_NEG" and (latest - event.date.date()).days <= 5:
            penalty = max(penalty, 0.2)
        if event.tag == "TDNET" and "下方" in event.title:
            penalty = max(penalty, 0.3)
    return penalty


def upsert_picks(conn, picks: Iterable[Dict[str, object]]) -> None:
    rows = []
    for pick in picks:
        score: ScoreComponents = pick["score"]
        if score.normalized <= 0:
            continue
        # Store date as epoch milliseconds for SQLite/Prisma consistency
        try:
            # Interpret pick["date"] as YYYY-MM-DD at 00:00:00 UTC
            dt = datetime.strptime(str(pick["date"]), "%Y-%m-%d").replace(tzinfo=timezone.utc)
            epoch_ms = int(dt.timestamp() * 1000)
        except Exception:
            epoch_ms = None  # Fallback; should not happen with well-formed ISO date
        rows.append(
            (
                epoch_ms,
                pick["code"],
                round(score.normalized, 2),
                json.dumps(score.reasons, ensure_ascii=False),
                json.dumps(
                    {
                        "volume_z": pick["metrics"].get("volume_z"),
                        "gap_pct": pick["metrics"].get("gap_pct"),
                        "supply_demand_proxy": pick["metrics"].get("supply_demand_proxy"),
                    },
                    ensure_ascii=False,
                ),
            )
        )
    replace_many(conn, "Pick", ("date", "code", "scoreFinal", "reasons", "stats"), rows)


def main() -> None:
    env = load_env()
    database_url = env.get("DATABASE_URL", "file:./prisma/dev.db")
    session = requests.Session()
    session.headers.update({"User-Agent": env.get("HTTP_USER_AGENT", "kabu4-ingest/1.0")})

    tdnet_adapter = TdnetRssAdapter(rss_url=env.get("TDNET_RSS_URL"), session=session)
    earnings_adapter = EarningsAdapter(feed_url=env.get("EARNINGS_FEED_URL"), session=session)
    news_adapter = NewsAdapter(feed_url=env.get("NEWS_FEED_URL"), session=session)
    price_adapter = PriceAdapter()

    prices = price_adapter.fetch()
    feature_calc = FeatureCalculator(price_adapter)
    features = feature_calc.compute()

    feature_map = to_feature_map(features)
    events = []
    events.extend(detect_tdnet(tdnet_adapter.fetch()))
    events.extend(detect_earnings(earnings_adapter.fetch()))
    events.extend(detect_news(news_adapter.fetch()))
    events.extend(detect_volume_spike(feature_map))

    with sqlite_conn(database_url) as conn:
        # Prefer web-sourced symbols; fallback to local sample if none resolved
        web_symbols = fetch_web_symbols(env, events, session)
        symbols = web_symbols if web_symbols else read_symbols_local()
        upsert_symbols(conn, symbols)
        upsert_prices(conn, prices)
        upsert_features(conn, features)
        upsert_events(conn, events)
        clear_table(conn, "Pick")
        picks = build_daily_picks(env, prices, features, events)
        upsert_picks(conn, picks)
    print("Ingest job completed.")


if __name__ == "__main__":
    main()
