"""Adapter for news headlines (optional live JSON feed)."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import requests
from bs4 import BeautifulSoup


@dataclass(slots=True)
class NewsItem:
    code: str
    title: str
    summary: str
    published_at: datetime
    polarity: str
    source: str = "news"


class NewsAdapter:
    def __init__(
        self,
        sample_path: str | None = None,
        feed_url: str | None = None,
        session: Optional[requests.Session] = None,
    ) -> None:
        base = Path(__file__).resolve().parents[3] / "data" / "sample"
        self.sample_path = Path(sample_path) if sample_path else base / "news.json"
        self.feed_url = feed_url
        self.session = session or requests.Session()

    @staticmethod
    def _infer_polarity(text: str) -> str:
        normalized = text.lower()
        positives = [
            "上方",
            "増益",
            "増配",
            "最高益",
            "上振れ",
            "黒字",
        ]
        negatives = [
            "下方",
            "減益",
            "減配",
            "赤字",
            "下振れ",
        ]
        for keyword in positives:
            if keyword in text:
                return "pos"
        for keyword in negatives:
            if keyword in text:
                return "neg"
        return "neu"

    def _parse_json(self, raw: str) -> List[NewsItem]:
        data = json.loads(raw)
        items: List[NewsItem] = []
        if isinstance(data, list):
            for entry in data:
                try:
                    title = str(entry.get("title") or "").strip()
                    items.append(
                        NewsItem(
                            code=str(entry.get("code") or "").strip(),
                            title=title,
                            summary=str(entry.get("summary") or "").strip(),
                            polarity=str(entry.get("polarity") or self._infer_polarity(title)),
                            published_at=datetime.fromisoformat(str(entry.get("date"))),
                        )
                    )
                except Exception:
                    continue
        return items

    def _parse_html(self, html: str) -> List[NewsItem]:
        soup = BeautifulSoup(html, "html.parser")
        rows = soup.select("table.s_news_list tr")
        items: List[NewsItem] = []
        for row in rows:
            code_cell = row.select_one("td.oncodetip_code-data1")
            link = row.find("a")
            if not code_cell or not link:
                continue
            code = (code_cell.get("data-code") or code_cell.get_text(strip=True)).strip()
            if not code:
                continue
            title = link.get_text(strip=True)
            time_tag = row.find("time")
            if time_tag and time_tag.has_attr("datetime"):
                try:
                    published = datetime.fromisoformat(time_tag["datetime"])
                except ValueError:
                    published = datetime.now()
            else:
                published = datetime.now()
            items.append(
                NewsItem(
                    code=code,
                    title=title,
                    summary="",
                    polarity=self._infer_polarity(title),
                    published_at=published,
                )
            )
        return items

    def _fetch_live(self) -> List[NewsItem]:
        assert self.feed_url
        resp = self.session.get(self.feed_url, timeout=15)
        resp.raise_for_status()
        if resp.encoding is None:
            resp.encoding = resp.apparent_encoding or "utf-8"
        raw = resp.text
        items: List[NewsItem] = []
        if "json" in resp.headers.get("Content-Type", "").lower():
            items = self._parse_json(raw)
        else:
            try:
                items = self._parse_json(raw)
            except Exception:
                items = self._parse_html(raw)
        if not items:
            items = self._parse_html(raw)
        return items

    def fetch(self) -> List[NewsItem]:
        if self.feed_url:
            try:
                live = self._fetch_live()
                if live:
                    return live
            except Exception:
                pass
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
