"""Test configuration and fixtures for backend tests."""

import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Set minimal required environment variables for testing
os.environ.setdefault(
    "JWT_SECRET", "test_secret_key_long_enough_for_validation_32_chars_min"
)
os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "test")
os.environ.setdefault("VAPID_PRIVATE", "test_vapid_private_key")
os.environ.setdefault("COMPANY_EMAIL", "test@example.com")
os.environ.setdefault("CORE_DB_PASSWORD", "test_auth_password")
os.environ.setdefault("CLINICAL_SERVICES_ENABLED", "false")
# Force dry-run to prevent tests from sending real emails via Resend
os.environ["EMAIL_DRY_RUN"] = "true"

from app.db import get_core_db
from app.deps import require_clinical_services
from app.main import app, limiter
from app.models import Base, OrgUnit, Role, User
from app.security import hash_password

# Use in-memory SQLite database for unit tests
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> None:
    """Reset slowapi rate limiter state between tests."""
    limiter.reset()


engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=engine
)


#: A place created before anything else, to push two id sequences apart.
#:
#: ``organisations`` and ``org_unit`` number their rows independently, and
#: an organisation writes exactly one place, so a database holding only
#: organisations gives the two tables the same ids: organisation 3 is
#: place 3. Then any code that hands a place id to something expecting an
#: organisation id — or the reverse — works perfectly, in tests, and only
#: in tests. A real database has had places and organisations created
#: interleaved for months and the numbers stopped agreeing long ago.
#:
#: This row is a place that belongs to no organisation, so every
#: organisation created afterwards has a place id one higher than its own.
#: It is a ward rather than a top-level type, so it is not an
#: organisation by any question the application asks: it does not appear
#: in a list of roots, and no admin can see it, because nobody is a
#: member of anything above it.
ID_SPACER_PLACE_NAME = "Unattached ward (keeps the id sequences apart)"


@pytest.fixture(scope="function")
def db_session() -> Generator[Session]:
    """Create a fresh database session for each test."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    session.add(OrgUnit(name=ID_SPACER_PLACE_NAME, type="ward"))
    session.commit()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def test_client(db_session: Session) -> TestClient:
    """Create a test client with database session override."""

    def override_get_core_db():
        # Mirrors get_core_db()'s auto-commit-on-success /
        # rollback-on-exception behaviour (app/db/core_db.py), minus the
        # close() — db_session's own fixture owns that lifecycle since
        # it's shared across every request within a test.
        try:
            yield db_session
            db_session.commit()
        except Exception:
            db_session.rollback()
            raise

    app.dependency_overrides[get_core_db] = override_get_core_db
    # Allow clinical endpoints in tests (CLINICAL_SERVICES_ENABLED=false
    # in test env). Tests for the guard itself override this back.
    app.dependency_overrides[require_clinical_services] = lambda: None
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session: Session) -> User:
    """Create a test user in the database.

    Carries ``registered_nurse``, so the competencies are a member of
    staff's. The fixture previously declared no profession and took the
    column default of ``patient``, which granted
    ``access_patient_records`` back when that id meant both a caseload
    and one's own record. Splitting it into
    ``access_own_patient_records`` made the assumption visible: a
    fixture placed as staff at an organisation, reading a patient there,
    was relying on the patient profession to carry a clinical
    competency.
    """
    user = User(
        username="testuser",
        email="test@example.com",
        password_hash=hash_password("TestPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession="registered_nurse",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def clinician_role(db_session: Session) -> Role:
    """Create Clinician role."""
    role = Role(name="Clinician")
    db_session.add(role)
    db_session.commit()
    db_session.refresh(role)
    return role


@pytest.fixture
def test_clinician(db_session: Session, clinician_role: Role) -> User:
    """Create a test user with Clinician role.

    The Clinician *role* is a separate idea from the profession, and only
    the profession grants competencies. Without one this fixture took
    the column default of ``patient``, so a user called "clinician" held
    a patient's competency and nothing clinical.
    """
    user = User(
        username="testclinician",
        email="clinician@example.com",
        password_hash=hash_password("ClinicianPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession="specialty_trainee_1_2",
    )
    user.roles.append(clinician_role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def authenticated_client(
    test_client: TestClient, test_user: User
) -> TestClient:
    """Create an authenticated test client."""
    response = test_client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "TestPassword123!"},
    )
    assert response.status_code == 200
    return test_client


@pytest.fixture
def authenticated_clinician_client(
    test_client: TestClient, test_clinician: User
) -> TestClient:
    """Create an authenticated test client with Clinician role."""
    response = test_client.post(
        "/api/auth/login",
        json={
            "username": "testclinician",
            "password": "ClinicianPassword123!",
        },
    )
    assert response.status_code == 200
    return test_client


@pytest.fixture
def test_admin(db_session: Session) -> User:
    """Create a test user who administers users at their organisations.

    Carries ``system_administrator``, which grants ``manage_users``. The
    fixture previously had no profession and so took the column default
    of ``patient``, holding ``access_patient_records`` and nothing an
    administrator needs — invisible while the routes compared ranks, and
    a refusal the moment they ask for a competency instead.
    """
    user = User(
        username="testadmin",
        email="admin@example.com",
        password_hash=hash_password("AdminPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession="system_administrator",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def authenticated_admin_client(
    test_client: TestClient, test_admin: User
) -> TestClient:
    """Create an authenticated test client with admin permissions.

    Automatically sets the X-CSRF-Token header for state-changing requests.
    """
    response = test_client.post(
        "/api/auth/login",
        json={"username": "testadmin", "password": "AdminPassword123!"},
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")
    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf
    return test_client


@pytest.fixture
def test_patient_manager(db_session: Session) -> User:
    """Create a user who manages an organisation's caseload.

    Carries ``patient_manager``, the profession holding
    ``manage_patient_membership``. Distinct from ``test_admin``, whose
    ``system_administrator`` grants ``manage_users`` but not this: a
    patient is not a user, so administering accounts does not confer
    authority over which patients a place cares for.
    """
    user = User(
        username="testpatientmanager",
        email="patientmanager@example.com",
        password_hash=hash_password("PatientMgrPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession="patient_manager",
        platform_role="standard",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def authenticated_patient_manager_client(
    test_client: TestClient, test_patient_manager: User
) -> TestClient:
    """An authenticated client holding ``manage_patient_membership``.

    Automatically sets the X-CSRF-Token header for state-changing requests.
    """
    response = test_client.post(
        "/api/auth/login",
        json={
            "username": "testpatientmanager",
            "password": "PatientMgrPassword123!",
        },
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")
    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf
    return test_client


@pytest.fixture
def test_superadmin(db_session: Session) -> User:
    """Create a test user with superadmin permissions.

    Carries ``superadmin_profession``, as a provisioned superadmin does. The
    fixture previously had no profession at all and so held no
    competencies, which would have made every competency-gated admin
    route refuse the one role meant to reach everything.
    """
    user = User(
        username="testsuperadmin",
        email="superadmin@example.com",
        password_hash=hash_password("SuperAdminPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession="superadmin_profession",
        platform_role="superadmin",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def authenticated_superadmin_client(
    test_client: TestClient, test_superadmin: User
) -> TestClient:
    """Create an authenticated test client with superadmin permissions.

    Automatically sets the X-CSRF-Token header for state-changing requests.
    """
    response = test_client.post(
        "/api/auth/login",
        json={
            "username": "testsuperadmin",
            "password": "SuperAdminPassword123!",
        },
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")
    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf
    return test_client
