"""Adapter for mocked news headlines."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List


@dataclass(slots=True)
class NewsItem:
    code: str
    title: str
    summary: str
    published_at: datetime
    polarity: str
    source: str = "news"


class NewsAdapter:
    def __init__(self, sample_path: str | None = None) -> None:
        base = Path(__file__).resolve().parents[3] / "data" / "sample"
        self.sample_path = Path(sample_path) if sample_path else base / "news.json"

    def fetch(self) -> List[NewsItem]:
        with self.sample_path.open("r", encoding="utf-8") as fp:
            raw = json.load(fp)
        items: List[NewsItem] = []
        for entry in raw:
            items.append(
                NewsItem(
                    code=entry["code"],
                    title=entry["title"],
                    summary=entry.get("summary", ""),
                    polarity=entry.get("polarity", "neu"),
                    published_at=datetime.fromisoformat(entry["date"]),
                )
            )
        return items
