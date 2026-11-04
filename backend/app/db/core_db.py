"""Core database connection and session management.

This module provides SQLAlchemy engine and session management for the
core database (non-patient-facing application state: users, roles,
permissions, organisational units, teaching, and more).
"""

from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

#: The scope an access token needs to sign in to Cloud SQL as its account.
IAM_LOGIN_SCOPE = "https://www.googleapis.com/auth/sqlservice.login"


def iam_login_token() -> str:
    """A fresh access token for the account this process runs as.

    Cloud SQL accepts it as the password of that account's IAM database
    user. It lasts an hour, so one is fetched for every new connection
    rather than kept.

    Raises:
        google.auth.exceptions.GoogleAuthError: If no credentials are
            found, or the token cannot be fetched.
    """
    import google.auth
    from google.auth.transport.requests import Request

    credentials, _ = google.auth.default(scopes=[IAM_LOGIN_SCOPE])
    credentials.refresh(Request())  # type: ignore[no-untyped-call]

    return str(credentials.token)


def sign_in_with_iam(
    dialect: Any, connection_record: Any, cargs: Any, cparams: dict[str, Any]
) -> None:
    """Give a new connection a token as its password.

    A ``do_connect`` listener, so it runs as each connection is opened,
    including one the pool opens again after the token before it expired.
    """
    cparams["password"] = iam_login_token()


# Create core database engine
#
# The pool is sized against what the database accepts, not against how
# busy the app might get. Each uvicorn worker is its own process with its
# own engine, so the most the app can open is
#
#     (pool_size + max_overflow) x workers x Cloud Run instances
#     (5 + 4) x 2 x 5 = 90
#
# against the 100 connections the core database's tier accepts by
# default (``db_tier`` in infra/environments/app/terraform.tfvars). The
# ten left over are for the slots Postgres reserves, the migrations job
# and a session opened by hand.
#
# Going over is worse than waiting: a request with no free connection in
# the pool queues for one, where a request Postgres has no room for is
# refused outright. So raise these only with the tier, the worker count
# in backend/Dockerfile and ``cloud_run_max_instances`` in view.
core_engine = create_engine(
    settings.CORE_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=4,
)

# The framework sync job signs in as its own service account, with no
# password: see docs/docs/backend/passport/index.md. Everything else
# signs in with CORE_DB_PASSWORD.
if settings.CORE_DB_IAM_AUTH:
    event.listen(core_engine, "do_connect", sign_in_with_iam)

# Create session factory
CoreSessionLocal = sessionmaker(
    bind=core_engine,
    autoflush=False,
)


def get_core_db() -> Generator[Session]:
    """FastAPI dependency to provide core database sessions.

    Commits automatically if the route returns without error, and rolls
    back if any exception is raised - a route no longer needs to call
    `db.commit()` itself. If a server-generated value (e.g. a new row's
    `id`) is needed mid-request, use `db.flush()` instead - it populates
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
