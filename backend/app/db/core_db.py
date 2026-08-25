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

    The caller is responsible for calling `db.commit()` after any write —
    this dependency never commits. If a route forgets, the request still
    succeeds but the change is silently rolled back when the session
    closes at the end of the request.

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
            db.commit()
            db.refresh(user)
            return user
        ```
    """
    db = CoreSessionLocal()
    try:
        yield db
    finally:
        db.close()
