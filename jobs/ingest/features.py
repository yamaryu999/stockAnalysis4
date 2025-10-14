"""Feature engineering for ingest job."""
from __future__ import annotations

from dataclasses import dataclass
from statistics import mean, pstdev
from typing import Dict, Iterable, List, Optional

from .adapters.price_adapter import PriceAdapter, PriceBar


@dataclass(slots=True)
class FeatureRecord:
    code: str
    date: str
    name: str
    value: float


class FeatureCalculator:
    def __init__(self, price_adapter: PriceAdapter) -> None:
        self.price_adapter = price_adapter

    def compute(self) -> List[FeatureRecord]:
        result: List[FeatureRecord] = []
        prices = self.price_adapter.fetch()
        for code, bars in prices.items():
            volumes: List[int] = []
            closes: List[float] = []
            for idx, bar in enumerate(bars):
                volumes.append(bar.volume)
                closes.append(bar.close)

                twenty_window = volumes[-20:]
                five_window = volumes[-5:]
                prev_close = closes[-2] if idx >= 1 else None
                high20 = max(closes[-20:]) if len(closes) >= 1 else bar.close

                volume_z = self._volume_z(volumes, idx)
                if volume_z is not None:
                    result.append(
                        FeatureRecord(code=code, date=bar.trading_date.isoformat(), name="volume_z", value=volume_z)
                    )
                if prev_close is not None:
                    gap_pct = (bar.open - prev_close) / prev_close
                    result.append(
                        FeatureRecord(code=code, date=bar.trading_date.isoformat(), name="gap_pct", value=gap_pct)
                    )
                if bar.vwap is not None and bar.vwap != 0:
                    vwap_dev = (bar.close - bar.vwap) / bar.vwap
                    result.append(
                        FeatureRecord(code=code, date=bar.trading_date.isoformat(), name="vwap_dev_pct", value=vwap_dev)
                    )
                supply_demand = self._supply_demand(five_window, twenty_window)
                if supply_demand is not None:
                    result.append(
                        FeatureRecord(
                            code=code,
                            date=bar.trading_date.isoformat(),
                            name="supply_demand_proxy",
                            value=supply_demand,
                        )
                    )
                high20d_dist = (bar.close / high20) - 1 if high20 else 0
                result.append(
                    FeatureRecord(
                        code=code,
                        date=bar.trading_date.isoformat(),
                        name="high20d_dist_pct",
                        value=high20d_dist,
                    )
                )
        return result

    def _volume_z(self, volumes: List[int], idx: int) -> Optional[float]:
        window = volumes[-20:]
        if len(window) < 20:
            return None
        mean_vol = mean(window)
        std_vol = pstdev(window)
        if std_vol == 0:
            return 0.0
        current = window[-1]
        return (current - mean_vol) / std_vol

    def _supply_demand(self, five_window: Iterable[int], twenty_window: Iterable[int]) -> Optional[float]:
        five = list(five_window)
        twenty = list(twenty_window)
        if len(five) < 5 or len(twenty) < 20:
            return None
        avg_five = mean(five)
        avg_twenty = mean(twenty)
        if avg_twenty == 0:
            return None
        return avg_five / avg_twenty
