"""Authentication database connection and session management.

This module provides SQLAlchemy engine and session management for the
authentication database (user accounts, roles, sessions).
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# Create auth database engine
auth_engine = create_engine(
    settings.AUTH_DATABASE_URL,
    future=True,
    pool_pre_ping=True,  # Verify connections before use
    pool_size=5,
    max_overflow=10,
)

# Create session factory
AuthSessionLocal = sessionmaker(
    bind=auth_engine,
    autoflush=False,
    autocommit=False,
    future=True,
)


class AuthBase(DeclarativeBase):
    """Base class for auth database models."""

    pass


def get_auth_db():
    """FastAPI dependency to provide auth database sessions.

    Yields:
        Session: SQLAlchemy database session for auth database.

    Example:
        ```python
        @router.get("/users")
        def list_users(db: Session = Depends(get_auth_db)):
            users = db.query(User).all()
            return users
        ```
    """
    db = AuthSessionLocal()
    try:
        yield db
    finally:
        db.close()
