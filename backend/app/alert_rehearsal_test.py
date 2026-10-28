"""Tests for the alert watcher's rehearsal route."""

from fastapi.testclient import TestClient

URL = "/api/operator/rehearsal/average"


def test_average_requires_auth(test_client: TestClient) -> None:
    """Somebody not logged in is refused."""
    response = test_client.get(URL, params={"values": "1,2,3"})

    assert response.status_code == 401


def test_average_requires_an_operator(
    authenticated_client: TestClient,
) -> None:
    """A logged-in user who is not an operator is refused."""
    response = authenticated_client.get(URL, params={"values": "1,2,3"})

    assert response.status_code == 403


def test_average_of_three_numbers(
    authenticated_superadmin_client: TestClient,
) -> None:
    """An operator gets the count and the mean."""
    response = authenticated_superadmin_client.get(
        URL, params={"values": "1, 2,3"}
    )

    assert response.status_code == 200
    assert response.json() == {"count": 3, "mean": 2.0}


def test_average_refuses_anything_but_numbers(
    authenticated_superadmin_client: TestClient,
) -> None:
    """Letters are refused before any work is done."""
    response = authenticated_superadmin_client.get(
        URL, params={"values": "1,two,3"}
    )

    assert response.status_code == 422


def test_average_refuses_no_numbers(
    authenticated_superadmin_client: TestClient,
) -> None:
    """No numbers has no mean, so it is refused rather than failing."""
    response = authenticated_superadmin_client.get(URL, params={"values": ""})

    assert response.status_code == 422
