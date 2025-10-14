"""Daily ingest job entrypoint."""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Mapping

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


def read_symbols() -> List[Dict[str, str]]:
    symbols_path = ROOT / "data" / "sample" / "symbols.csv"
    with symbols_path.open("r", encoding="utf-8") as fp:
        reader = csv.DictReader(fp)
        return list(reader)


def upsert_symbols(conn, symbols: Iterable[Mapping[str, str]]) -> None:
    rows = [(row["code"], row["name"], row.get("sector")) for row in symbols]
    replace_many(conn, "Symbol", ("code", "name", "sector"), rows)


def upsert_prices(conn, prices: Mapping[str, List[PriceBar]]) -> None:
    rows = []
    for code, bars in prices.items():
        for bar in bars:
            rows.append(
                (
                    code,
                    bar.trading_date.isoformat(),
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
            feature.date,
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
        rows.append(
            (
                event_id,
                event.code,
                event.date.isoformat(),
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
    latest_date = max(
        (bar.trading_date for price_list in prices.values() for bar in price_list),
        default=date.today(),
    )
    latest_iso = latest_date.isoformat()

    events_by_code: Dict[str, List[DetectedEvent]] = defaultdict(list)
    for event in events:
        events_by_code[event.code].append(event)

    price_lookup: Dict[str, Dict[str, PriceBar]] = defaultdict(dict)
    for code, price_list in prices.items():
        for bar in price_list:
            price_lookup[code][bar.trading_date.isoformat()] = bar

    picks: List[Dict[str, object]] = []

    for code, price_list in price_lookup.items():
        bar = price_list.get(latest_iso)
        if not bar:
            continue
        daily_features = feature_map.get(code, {}).get(latest_iso, {})
        metrics = {
            "volume_z": daily_features.get("volume_z", 0.0),
            "gap_pct": daily_features.get("gap_pct", 0.0),
            "supply_demand_proxy": daily_features.get("supply_demand_proxy", 0.0),
        }
        filters = {
            "high20d_dist_pct": daily_features.get("high20d_dist_pct", 0.0),
            "close": bar.close,
        }
        penalty = {
            "recent_negative": recent_negative_penalty(events_by_code.get(code, []), latest_date)
        }
        candidate_events = [
            ev
            for ev in events_by_code.get(code, [])
            if ev.date.date() <= latest_date and ev.date.date() >= latest_date - timedelta(days=2)
        ]
        score = calculate_score(weights, candidate_events, metrics, filters, penalty)
        if score.normalized >= weights.minScore:
            picks.append(
                {
                    "date": latest_iso,
                    "code": code,
                    "score": score,
                    "close": bar.close,
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
        rows.append(
            (
                pick["date"],
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
    tdnet_adapter = TdnetRssAdapter()
    earnings_adapter = EarningsAdapter()
    news_adapter = NewsAdapter()
    price_adapter = PriceAdapter()

    symbols = read_symbols()
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
