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
os.environ.setdefault("AUTH_DB_PASSWORD", "test_auth_password")
os.environ.setdefault("FHIR_DB_PASSWORD", "test_fhir_password")
os.environ.setdefault("EHRBASE_DB_PASSWORD", "test_ehrbase_password")
os.environ.setdefault("EHRBASE_API_PASSWORD", "test_ehrbase_api_password")
os.environ.setdefault(
    "EHRBASE_API_ADMIN_PASSWORD", "test_ehrbase_admin_password"
)

from app.db import get_session
from app.main import app
from app.models import Base, Role, User
from app.security import hash_password

# Use in-memory SQLite database for unit tests
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=engine
)


@pytest.fixture(scope="function")
def db_session() -> Generator[Session]:
    """Create a fresh database session for each test."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def test_client(db_session: Session) -> TestClient:
    """Create a test client with database session override."""

    def override_get_session():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_session] = override_get_session
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session: Session) -> User:
    """Create a test user in the database."""
    user = User(
        username="testuser",
        email="test@example.com",
        password_hash=hash_password("TestPassword123!"),
        is_active=True,
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
    """Create a test user with Clinician role."""
    user = User(
        username="testclinician",
        email="clinician@example.com",
        password_hash=hash_password("ClinicianPassword123!"),
        is_active=True,
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
