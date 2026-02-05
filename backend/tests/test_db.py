"""Tests for database session management."""

from sqlalchemy.orm import Session

from app.db.auth_db import get_auth_db


class TestAuthDB:
    """Test auth database session management."""

    def test_get_auth_db_yields_session(self):
        """Test that get_auth_db yields a database session."""
        gen = get_auth_db()
        session = next(gen)
        assert isinstance(session, Session)
        # Close the session
        try:
            next(gen)
        except StopIteration:
            pass
