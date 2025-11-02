"""Adapter for earnings summaries (optional live JSON feed)."""
from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import requests


@dataclass(slots=True)
class EarningsItem:
    code: str
    title: str
    summary: str
    announced_at: datetime
    source: str = "earnings"


class EarningsAdapter:
    def __init__(
        self,
        sample_path: str | None = None,
        feed_url: str | None = None,
        session: Optional[requests.Session] = None,
    ) -> None:
        base = Path(__file__).resolve().parents[3] / "data" / "sample"
        self.sample_path = Path(sample_path) if sample_path else base / "events.csv"
        self.feed_url = feed_url
        self.session = session or requests.Session()

    def _fetch_live(self) -> List[EarningsItem]:
        assert self.feed_url
        resp = self.session.get(self.feed_url, timeout=15)
        resp.raise_for_status()
        if resp.encoding is None:
            resp.encoding = resp.apparent_encoding or "utf-8"
        raw = resp.text
        data = json.loads(raw)
        items: List[EarningsItem] = []
        if isinstance(data, list):
            for row in data:
                try:
                    items.append(
                        EarningsItem(
                            code=str(row.get("code") or "").strip(),
                            title=str(row.get("title") or "").strip(),
                            summary=str(row.get("summary") or "").strip(),
                            announced_at=datetime.fromisoformat(str(row.get("date"))),
                        )
                    )
                except Exception:
                    continue
        return items

    def fetch(self) -> List[EarningsItem]:
        if self.feed_url:
            try:
                live = self._fetch_live()
                if live:
                    return live
            except Exception:
                pass
        items: List[EarningsItem] = []
        with self.sample_path.open("r", encoding="utf-8") as fp:
            reader = csv.DictReader(fp)
            for row in reader:
                if row.get("type") != "EARNINGS":
                    continue
                items.append(
                    EarningsItem(
                        code=row["code"],
                        title=row["title"],
                        summary=row.get("summary", ""),
                        announced_at=datetime.fromisoformat(row["date"]),
                    )
                )
        return items
