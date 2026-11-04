"""The framework_sync role may read and add framework rows, and no more.

The framework sync job signs in as its own database user, which holds
only this role, so these are the limits on what a bug in the sync could
do. Each check runs as the role, with ``SET ROLE``, inside a transaction
that is rolled back, so the database is left as it was.

They need a real, migrated PostgreSQL database, as
``alembic_check_test.py`` does, and run with it in the
``alembic_drift_check`` CI job, which runs ``pytest -m migration``.
Locally::

    docker compose -p quill-migrate-<worktree> -f compose.migrate.yml \\
        run --rm migrate sh -lc \\
        'alembic upgrade head && pytest -m migration'
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.config import settings
from app.features.passport.sync import sync_frameworks

pytestmark = [pytest.mark.integration, pytest.mark.migration]


@pytest.fixture
def as_the_role() -> Iterator[Connection]:
    """A connection acting as framework_sync, rolled back afterwards."""
    engine = create_engine(settings.CORE_DATABASE_URL)

    with engine.connect() as connection:
        transaction = connection.begin()
        connection.execute(text("SET ROLE framework_sync"))

        try:
            yield connection
        finally:
            transaction.rollback()

    engine.dispose()


def test_a_sync_succeeds_as_the_role(as_the_role: Connection) -> None:
    """Everything the sync does, the role may do."""
    db = Session(bind=as_the_role, join_transaction_mode="create_savepoint")

    result = sync_frameworks(db)
    db.flush()

    assert result.succeeded, result.error


def test_the_role_cannot_delete_a_framework_row(
    as_the_role: Connection,
) -> None:
    with pytest.raises(ProgrammingError, match="permission denied"):
        as_the_role.execute(text("DELETE FROM passport_framework_version"))


def test_the_role_cannot_change_a_stored_version(
    as_the_role: Connection,
) -> None:
    with pytest.raises(ProgrammingError, match="permission denied"):
        as_the_role.execute(
            text("UPDATE passport_framework_competency SET display_name = ''")
        )


def test_the_role_cannot_read_any_other_table(
    as_the_role: Connection,
) -> None:
    with pytest.raises(ProgrammingError, match="permission denied"):
        as_the_role.execute(text("SELECT * FROM users"))


def test_the_role_cannot_sign_in_by_itself(as_the_role: Connection) -> None:
    """Only the sync job's user, which is granted the role, signs in."""
    can_login = as_the_role.execute(
        text(
            "SELECT rolcanlogin FROM pg_roles WHERE rolname = 'framework_sync'"
        )
    ).scalar_one()

    assert can_login is False
