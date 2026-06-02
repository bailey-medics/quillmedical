"""Core database connection and session management.

This module provides SQLAlchemy engine and session management for the
core database (user accounts, roles, sessions).
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# Create core database engine
core_engine = create_engine(
    settings.CORE_DATABASE_URL,
    future=True,
    pool_pre_ping=True,  # Verify connections before use
    pool_size=5,
    max_overflow=10,
)

# Create session factory
CoreSessionLocal = sessionmaker(
    bind=core_engine,
    autoflush=False,
    autocommit=False,
    future=True,
)


class CoreBase(DeclarativeBase):
    """Base class for core database models."""

    pass


def get_core_db() -> Generator[Session]:
    """FastAPI dependency to provide core database sessions.

    Yields:
        Session: SQLAlchemy database session for core database.

    Example:
        ```python
        @router.get("/users")
        def list_users(db: Session = Depends(get_core_db)):
            users = db.query(User).all()
            return users
        ```
    """
    db = CoreSessionLocal()
    try:
        yield db
    finally:
        db.close()
