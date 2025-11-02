"""Adapter for TDnet RSS/list pages (with local fallback)."""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional

import requests


@dataclass(slots=True)
class TdnetItem:
    code: str
    title: str
    summary: str
    announced_at: datetime
    source: str = "tdnet"


class TdnetRssAdapter:
    """Reads TDnet events from a live list (if configured) or local sample CSV."""

    def __init__(
        self,
        sample_path: str | None = None,
        rss_url: str | None = None,
        session: Optional[requests.Session] = None,
    ) -> None:
        base = Path(__file__).resolve().parents[3] / "data" / "sample"
        self.sample_path = Path(sample_path) if sample_path else base / "events.csv"
        self.rss_url = rss_url
        self.session = session or requests.Session()

    def _fetch_live(self) -> List[TdnetItem]:
        assert self.rss_url
        resp = self.session.get(self.rss_url, timeout=15)
        resp.raise_for_status()
        if resp.encoding is None:
            resp.encoding = resp.apparent_encoding or "utf-8"
        html = resp.text
        # Infer date from URL like I_list_001_YYYYMMDD.html; fallback to today
        m = re.search(r"(20\d{6})", self.rss_url)
        if m:
            dt = datetime.strptime(m.group(1), "%Y%m%d")
        else:
            dt = datetime.utcnow()
        codes = sorted({match.group(0) for match in re.finditer(r"(?<!\d)(\d{4})(?!\d)", html)})
        items: List[TdnetItem] = []
        for code in codes:
            items.append(
                TdnetItem(
                    code=code,
                    title=f"TDNET 公開情報 {code}",
                    summary="",
                    announced_at=dt,
                )
            )
        return items

    def fetch(self) -> List[TdnetItem]:
        if self.rss_url:
            try:
                return self._fetch_live()
            except Exception:
                # fall back to local
                pass
        items: List[TdnetItem] = []
        with self.sample_path.open("r", encoding="utf-8") as fp:
            reader = csv.DictReader(fp)
            for row in reader:
                if row.get("type") != "TDNET":
                    continue
                announced_at = datetime.fromisoformat(row["date"])
                items.append(
                    TdnetItem(
                        code=row["code"],
                        title=row["title"],
                        summary=row.get("summary", ""),
                        announced_at=announced_at,
                    )
                )
        return items

    def iter_raw(self) -> Iterable[TdnetItem]:
        return self.fetch()
