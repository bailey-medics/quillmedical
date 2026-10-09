"""The rate limiter is off in the testing environment.

The end-to-end suite drives two browser projects at one backend from one
address, and their logins together exceed what ``/auth/login`` allows a
minute. Tests of the limiter itself force-enable it instead.
"""

from fastapi.testclient import TestClient

from app.config import settings
from app.rate_limit import limiter


def test_limiter_is_off_where_the_tests_run() -> None:
    # CI's unit job leaves BACKEND_ENV at its default, development; the
    # unit-test container and the end-to-end stack set testing. The limiter
    # is off in both, and this test must pass in both.
    assert settings.BACKEND_ENV in {"development", "testing"}
    assert limiter.enabled is False


def test_repeated_logins_are_not_throttled(test_client: TestClient) -> None:
    for _ in range(7):
        response = test_client.post(
            "/api/auth/login",
            json={"username": "nobody", "password": "wrong"},
        )
        assert response.status_code != 429, response.text
