"""Mock adapter for earnings summaries."""
from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List


@dataclass(slots=True)
class EarningsItem:
    code: str
    title: str
    summary: str
    announced_at: datetime
    source: str = "earnings"


class EarningsAdapter:
    def __init__(self, sample_path: str | None = None) -> None:
        base = Path(__file__).resolve().parents[3] / "data" / "sample"
        self.sample_path = Path(sample_path) if sample_path else base / "events.csv"

    def fetch(self) -> List[EarningsItem]:
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
