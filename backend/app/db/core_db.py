"""Core database connection and session management.

This module provides SQLAlchemy engine and session management for the
core database (non-patient-facing application state: users, roles,
permissions, organisations, sites, teaching, and more).
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# Create core database engine
core_engine = create_engine(
    settings.CORE_DATABASE_URL,
    future=True,
    pool_pre_ping=True,
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


def get_core_db() -> Generator[Session]:
    """FastAPI dependency to provide core database sessions.

    Commits automatically if the route returns without error, and rolls
    back if any exception is raised — a route no longer needs to call
    `db.commit()` itself. If a server-generated value (e.g. a new row's
    `id`) is needed mid-request, use `db.flush()` instead — it populates
    generated columns without ending the transaction, so the row stays
    rollback-able if something later in the request fails.

    Yields:
        Session: SQLAlchemy database session for core database.

    Example:
        ```python
        @router.get("/users")
        def list_users(db: Session = Depends(get_core_db)):
            return db.scalars(select(User)).all()

        @router.post("/users")
        def create_user(user_in: UserCreate, db: Session = Depends(get_core_db)):
            user = User(**user_in.model_dump())
            db.add(user)
            db.flush()
            db.refresh(user)
            return user
        ```
    """
    db = CoreSessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
