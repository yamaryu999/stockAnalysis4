"""SQLite helpers for ingest jobs."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Iterable, Iterator, Sequence

from .env import resolve_database_path


@contextmanager
def sqlite_conn(database_url: str) -> Iterator[sqlite3.Connection]:
    path = resolve_database_path(database_url)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        yield conn
        conn.commit()
    finally:
        conn.close()


def replace_many(
    conn: sqlite3.Connection,
    table: str,
    columns: Sequence[str],
    rows: Iterable[Sequence[object]],
) -> None:
    placeholders = ",".join(["?"] * len(columns))
    sql = f"REPLACE INTO {table} ({','.join(columns)}) VALUES ({placeholders})"
    conn.executemany(sql, rows)


def clear_table(conn: sqlite3.Connection, table: str) -> None:
    conn.execute(f"DELETE FROM {table}")


def to_iso(dt: datetime | str) -> str:
    if isinstance(dt, str):
        return dt
    return dt.replace(microsecond=0).isoformat()
