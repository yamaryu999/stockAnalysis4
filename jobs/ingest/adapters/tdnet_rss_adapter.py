"""Adapter for TDnet RSS (mocked for MVP)."""
from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List


@dataclass(slots=True)
class TdnetItem:
    code: str
    title: str
    summary: str
    announced_at: datetime
    source: str = "tdnet"


class TdnetRssAdapter:
    """Reads TDnet events from local sample CSV."""

    def __init__(self, sample_path: str | None = None) -> None:
        base = Path(__file__).resolve().parents[3] / "data" / "sample"
        self.sample_path = Path(sample_path) if sample_path else base / "events.csv"

    def fetch(self) -> List[TdnetItem]:
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
