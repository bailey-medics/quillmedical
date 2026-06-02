"""Tests for database session management."""

from sqlalchemy.orm import Session

from app.db.core_db import get_core_db


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
