# app/db.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

if not getattr(settings, "DATABASE_URL", None):
    raise RuntimeError("DATABASE_URL must be set (in .env or env)")

database_url: str = settings.DATABASE_URL  # type: ignore[assignment]
engine = create_engine(database_url, future=True)
SessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, future=True
)


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
