"""Event detection rules for the MVP."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Iterable, List, Mapping

from .adapters.earnings_adapter import EarningsItem
from .adapters.news_adapter import NewsItem
from .adapters.tdnet_rss_adapter import TdnetItem
from .features import FeatureRecord

GUIDE_UP_PATTERNS = [
    re.compile(pattern)
    for pattern in [
        r"上方修正",
        r"増配",
        r"業績予想.*修正",
        r"利益予想.*上方"
    ]
]

EARNINGS_PATTERNS = [
    re.compile(pattern)
    for pattern in [
        r"第?\d四半期",
        r"通期",
        r"上期",
        r"下期",
    ]
]


@dataclass(slots=True)
class DetectedEvent:
    code: str
    date: datetime
    type: str
    tag: str
    title: str
    summary: str
    source: str
    score_raw: float | None = None


def detect_tdnet(items: Iterable[TdnetItem]) -> List[DetectedEvent]:
    events: List[DetectedEvent] = []
    for item in items:
        for pattern in GUIDE_UP_PATTERNS:
            if pattern.search(item.title):
                events.append(
                    DetectedEvent(
                        code=item.code,
                        date=item.announced_at,
                        type="GUIDE_UP",
                        tag="GUIDE_UP",
                        title=item.title,
                        summary=item.summary,
                        source=item.source,
                        score_raw=0.9,
                    )
                )
                break
        else:
            events.append(
                DetectedEvent(
                    code=item.code,
                    date=item.announced_at,
                    type="TDNET",
                    tag="TDNET",
                    title=item.title,
                    summary=item.summary,
                    source=item.source,
                    score_raw=0.5,
                )
            )
    return events


def detect_earnings(items: Iterable[EarningsItem]) -> List[DetectedEvent]:
    events: List[DetectedEvent] = []
    for item in items:
        tone = 0.6
        for pattern in EARNINGS_PATTERNS:
            if pattern.search(item.title):
                tone = 0.8
                break
        events.append(
            DetectedEvent(
                code=item.code,
                date=item.announced_at,
                type="EARNINGS",
                tag="EARNINGS_POSITIVE",
                title=item.title,
                summary=item.summary,
                source=item.source,
                score_raw=tone,
            )
        )
    return events


def detect_volume_spike(feature_map: Mapping[str, Mapping[str, Mapping[str, float]]]) -> List[DetectedEvent]:
    events: List[DetectedEvent] = []
    for code, by_date in feature_map.items():
        for date_str, features in by_date.items():
            volume_z = features.get("volume_z")
            if volume_z is None:
                continue
            if volume_z >= 2.0:
                events.append(
                    DetectedEvent(
                        code=code,
                        date=datetime.fromisoformat(date_str),
                        type="VOL_SPIKE",
                        tag="VOL_SPIKE",
                        title="出来高急増",
                        summary=f"volume_z={volume_z:.2f}",
                        source="volume_rule",
                        score_raw=min(volume_z / 5, 1.0),
                    )
                )
    return events


def detect_news(news_items: Iterable[NewsItem]) -> List[DetectedEvent]:
    polarity_to_tag = {
        "pos": ("NEWS", "NEWS_POS", 0.7),
        "neg": ("NEWS", "NEWS_NEG", 0.3),
        "neu": ("NEWS", "NEWS_NEU", 0.4),
    }
    events: List[DetectedEvent] = []
    for item in news_items:
        event_type, tag, score = polarity_to_tag.get(item.polarity, ("NEWS", "NEWS_NEU", 0.4))
        events.append(
            DetectedEvent(
                code=item.code,
                date=item.published_at,
                type=event_type,
                tag=tag,
                title=item.title,
                summary=item.summary,
                source=item.source,
                score_raw=score,
            )
        )
    return events


def to_feature_map(features: Iterable[FeatureRecord]) -> Dict[str, Dict[str, Dict[str, float]]]:
    feature_map: Dict[str, Dict[str, Dict[str, float]]] = {}
    for feature in features:
        symbol_bucket = feature_map.setdefault(feature.code, {})
        daily_bucket = symbol_bucket.setdefault(feature.date, {})
        daily_bucket[feature.name] = feature.value
    return feature_map
