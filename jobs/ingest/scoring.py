"""Scoring utilities mirroring the TypeScript implementation."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Tuple

from .rules import DetectedEvent

VOLUME_Z_MAX = 5
GAP_PCT_MAX = 0.05
SUPPLY_DEMAND_MAX = 2


@dataclass(slots=True)
class ScoreComponents:
    raw: float
    normalized: float
    passed_filters: bool
    reasons: List[Dict[str, object]]


@dataclass(slots=True)
class WeightConfig:
    event: Dict[str, float]
    tape: Dict[str, float]
    minScore: float


def load_weights(env: Mapping[str, str]) -> WeightConfig:
    candidate_env = env.get("WEIGHT_CONFIG_PATH")
    base_candidates = [
        Path(candidate_env) if candidate_env else None,
        Path.cwd() / "config" / "weights.json",
        Path.cwd().parent / "config" / "weights.json",
        Path(__file__).resolve().parents[2] / "config" / "weights.json",
    ]
    config_path = next((path for path in base_candidates if path and path.exists()), None)
    if not config_path:
        raise FileNotFoundError("weights.json not found")
    data = json.loads(config_path.read_text(encoding="utf-8"))
    event = data["event"]
    tape = data["tape"]
    min_score = data.get("minScore", 60)

    def override(key: str, bucket: Dict[str, float], alias: str | None = None) -> None:
        env_key = alias or key.upper().replace(".", "_")
        if env_key in env:
            bucket[key.split(".")[-1]] = float(env[env_key])

    overrides = {
        "event.GUIDE_UP": "WEIGHT_EVENT_GUIDE_UP",
        "event.EARNINGS_POSITIVE": "WEIGHT_EVENT_EARNINGS_POSITIVE",
        "event.TDNET": "WEIGHT_EVENT_TDNET",
        "event.VOL_SPIKE": "WEIGHT_EVENT_VOL_SPIKE",
        "event.NEWS_POS": "WEIGHT_EVENT_NEWS_POS",
        "event.NEWS_NEU": "WEIGHT_EVENT_NEWS_NEU",
        "event.NEWS_NEG": "WEIGHT_EVENT_NEWS_NEG",
        "tape.volume_z": "WEIGHT_TAPE_VOLUME_Z",
        "tape.gap_pct": "WEIGHT_TAPE_GAP_PCT",
        "tape.supply_demand_proxy": "WEIGHT_TAPE_SUPPLY_DEMAND",
    }
    for path_key, env_key in overrides.items():
        bucket_name, entry = path_key.split(".")
        if bucket_name == "event":
            bucket = event
        else:
            bucket = tape
        if env_key in env:
            bucket[entry] = float(env[env_key])

    if "MIN_SCORE" in env:
        min_score = float(env["MIN_SCORE"])

    return WeightConfig(event=event, tape=tape, minScore=min_score)


def normalize_tape(metrics: Mapping[str, float]) -> List[Dict[str, object]]:
    reasons: List[Dict[str, object]] = []
    mapping = {
        "volume_z": (VOLUME_Z_MAX, metrics.get("volume_z")),
        "gap_pct": (GAP_PCT_MAX, metrics.get("gap_pct")),
        "supply_demand_proxy": (SUPPLY_DEMAND_MAX, metrics.get("supply_demand_proxy")),
    }
    for key, (max_value, value) in mapping.items():
        if value is None:
            continue
        if key == "gap_pct":
            normalized = max(min(value, max_value), 0) / max_value
        else:
            normalized = max(min(value, max_value), 0) / max_value
        reasons.append(
            {
                "kind": "tape",
                "tag": key,
                "normalized": normalized,
                "details": {"raw": value},
            }
        )
    return reasons


def calculate_score(
    weights: WeightConfig,
    events: Iterable[DetectedEvent],
    metrics: Mapping[str, float],
    filters: Mapping[str, float],
    penalties: Mapping[str, float],
) -> ScoreComponents:
    tape_reasons = normalize_tape(metrics)
    weighted_total = 0.0
    weight_sum = 0.0
    reasons: List[Dict[str, object]] = []
    for reason in tape_reasons:
        tag_weight = weights.tape.get(reason["tag"], 0.0)
        if tag_weight == 0:
            continue
        weighted_total += reason["normalized"] * tag_weight
        weight_sum += tag_weight
        reasons.append(
            {
                "kind": "tape",
                "tag": reason["tag"],
                "weight": tag_weight,
                "applied": reason["normalized"] * tag_weight,
                "details": reason.get("details"),
            }
        )

    for event in events:
        tag_weight = weights.event.get(event.tag, 0.0)
        if tag_weight == 0:
            continue
        raw_score = event.score_raw if event.score_raw is not None else 1.0
        normalized = min(max(raw_score, 0.0), 1.0)
        occurred_at: str | None = None
        if isinstance(event.date, datetime):
            occurred_at = event.date.isoformat()
        reasons.append(
            {
                "kind": "event",
                "tag": event.tag,
                "weight": tag_weight,
                "applied": normalized * tag_weight,
                "details": {
                    "title": event.title,
                    "source": event.source,
                    "occurredAt": occurred_at,
                },
            }
        )
        weighted_total += normalized * tag_weight
        weight_sum += tag_weight

    if weight_sum == 0:
        return ScoreComponents(raw=0.0, normalized=0.0, passed_filters=False, reasons=reasons)

    base_score = weighted_total / weight_sum
    penalty = min(max(penalties.get("recent_negative", 0.0), 0.0), 1.0)
    if penalty:
        reasons.append(
            {
                "kind": "penalty",
                "tag": "recent_negative_event",
                "weight": penalty,
                "applied": -penalty,
                "details": {},
            }
        )
    penalized = max(base_score - penalty, 0.0)

    passed_filters = True
    for key, threshold in {"high20d_dist_pct": -0.15, "close": 100}.items():
        value = filters.get(key)
        if value is None:
            continue
        if key == "high20d_dist_pct" and value < threshold:
            passed_filters = False
            reasons.append(
                {
                    "kind": "filter",
                    "tag": "high20d_dist_pct",
                    "weight": 0.0,
                    "applied": 0.0,
                    "details": {"value": value},
                }
            )
        if key == "close" and value < threshold:
            passed_filters = False
            reasons.append(
                {
                    "kind": "filter",
                    "tag": "close_price",
                    "weight": 0.0,
                    "applied": 0.0,
                    "details": {"value": value},
                }
            )

    normalized = penalized * 100 if passed_filters else 0.0
    return ScoreComponents(raw=penalized, normalized=normalized, passed_filters=passed_filters, reasons=reasons)
