"""Tests for database session management."""

import pytest
from sqlalchemy import Integer, String, create_engine
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    sessionmaker,
)

from app.db.core_db import get_core_db


class _ScratchBase(DeclarativeBase):
    """Base for a throwaway table used only by the tests below."""


class _ScratchRow(_ScratchBase):
    """A single-column table to exercise commit/rollback via get_core_db."""

    __tablename__ = "scratch_row"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String, nullable=False)


@pytest.fixture
def sqlite_session_factory():
    """An in-memory SQLite sessionmaker, isolated from the real core DB."""
    engine = create_engine("sqlite:///:memory:")
    _ScratchBase.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


class TestCoreDB:
    """Test core database session management."""

    def test_get_core_db_yields_session(self):
        """Test that get_core_db yields a database session."""
        gen = get_core_db()
        session = next(gen)
        assert isinstance(session, Session)
        # Close the session
        try:
            next(gen)
        except StopIteration:
            pass

    def test_get_core_db_commits_on_success(
        self, monkeypatch: pytest.MonkeyPatch, sqlite_session_factory
    ):
        """A route that returns normally should have its write persisted,
        even without an explicit db.commit() call."""
        monkeypatch.setattr(
            "app.db.core_db.CoreSessionLocal", sqlite_session_factory
        )

        gen = get_core_db()
        db = next(gen)
        db.add(_ScratchRow(id=1, label="written without explicit commit"))
        try:
            next(gen)
        except StopIteration:
            pass

        with sqlite_session_factory() as verify_session:
            row = verify_session.get(_ScratchRow, 1)
            assert row is not None
            assert row.label == "written without explicit commit"

    def test_get_core_db_rolls_back_on_exception(
        self, monkeypatch: pytest.MonkeyPatch, sqlite_session_factory
    ):
        """A route that raises mid-request should have its pending write
        discarded, not partially persisted."""
        monkeypatch.setattr(
            "app.db.core_db.CoreSessionLocal", sqlite_session_factory
        )

        gen = get_core_db()
        db = next(gen)
        db.add(_ScratchRow(id=1, label="should not survive"))
        with pytest.raises(RuntimeError):
            gen.throw(RuntimeError("simulated route failure"))

        with sqlite_session_factory() as verify_session:
            row = verify_session.get(_ScratchRow, 1)
            assert row is None
