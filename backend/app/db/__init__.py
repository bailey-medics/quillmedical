"""Core database connection for Quill Medical.

Provides the SQLAlchemy engine, session factory and `get_core_db`
FastAPI dependency for the core (PostgreSQL) database, re-exported below.
"""

from app.db.core_db import (
    CoreSessionLocal,
    core_engine,
    get_core_db,
)

__all__ = [
    "core_engine",
    "CoreSessionLocal",
    "get_core_db",
]
