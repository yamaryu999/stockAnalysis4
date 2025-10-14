"""Adapter for end-of-day OHLCV prices from sample CSV."""
from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, List


@dataclass(slots=True)
class PriceBar:
    trading_date: date
    code: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    vwap: float | None


class PriceAdapter:
    def __init__(self, sample_path: str | None = None) -> None:
        base = Path(__file__).resolve().parents[3] / "data" / "sample"
        self.sample_path = Path(sample_path) if sample_path else base / "daily_prices.csv"

    def fetch(self) -> Dict[str, List[PriceBar]]:
        symbol_prices: Dict[str, List[PriceBar]] = {}
        with self.sample_path.open("r", encoding="utf-8") as fp:
            reader = csv.DictReader(fp)
            for row in reader:
                code = row["code"]
                price = PriceBar(
                    trading_date=date.fromisoformat(row["date"]),
                    code=code,
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=int(row["volume"]),
                    vwap=float(row["vwap"]) if row.get("vwap") else None,
                )
                symbol_prices.setdefault(code, []).append(price)
        for code in symbol_prices:
            symbol_prices[code].sort(key=lambda bar: bar.trading_date)
        return symbol_prices

    def iter_all(self) -> Iterable[PriceBar]:
        for price_list in self.fetch().values():
            for bar in price_list:
                yield bar
