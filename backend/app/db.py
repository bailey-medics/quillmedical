# app/db.py
from app.config import settings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

if not getattr(settings, "DATABASE_URL", None):
    raise RuntimeError("DATABASE_URL must be set (in .env or env)")

engine = create_engine(settings.DATABASE_URL, future=True)
SessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, future=True
)


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
