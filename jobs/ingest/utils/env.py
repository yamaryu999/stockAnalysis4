"""Environment utilities for ingest jobs."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict

try:
    from dotenv import load_dotenv  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None


def load_env(dotenv_path: str | None = None) -> Dict[str, str]:
    """Load environment variables, respecting optional .env files."""
    if dotenv_path is None:
        candidates = [
            Path.cwd() / ".env",
            Path.cwd().parent / ".env",
            Path(__file__).resolve().parents[3] / ".env",
        ]
        dotenv_path = next((str(p) for p in candidates if p.exists()), None)
    if load_dotenv and dotenv_path:
        load_dotenv(dotenv_path)
    return dict(os.environ)


def resolve_database_path(database_url: str) -> str:
    """Resolve a SQLite file path from a Prisma-style database URL."""
    if database_url.startswith("file:" + "//"):
        return database_url[len("file://") :]
    if database_url.startswith("file:"):
        relative = database_url[len("file:") :]
        base = Path(__file__).resolve().parents[3]
        return str((base / relative).resolve())
    raise ValueError("Only SQLite file URLs are supported in the MVP ingest job")
