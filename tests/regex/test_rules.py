from datetime import datetime

from jobs.ingest.adapters.tdnet_rss_adapter import TdnetItem
from jobs.ingest.rules import detect_tdnet


def test_detect_tdnet_classifies_guide_up():
    item = TdnetItem(
        code="7203",
        title="トヨタ自動車 2024年3月期業績予想の上方修正",
        summary="売上高と利益を上方修正",
        announced_at=datetime(2024, 2, 1),
    )
    events = detect_tdnet([item])
    assert events[0].tag == "GUIDE_UP"


def test_detect_tdnet_defaults_to_tdnet_tag():
    item = TdnetItem(
        code="7203",
        title="トヨタ自動車 IR説明会資料のお知らせ",
        summary="",
        announced_at=datetime(2024, 2, 1),
    )
    events = detect_tdnet([item])
    assert events[0].tag == "TDNET"
