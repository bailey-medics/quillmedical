"""The old org_unit surfaces are gone.

Every org_unit lives at ``/api/org-units`` now. The sites and
organisations addresses stayed for a deploy cycle so nothing broke
mid-rollout, then answered 410 naming their replacement for several
releases after that. This is where they stop existing.

404 rather than 410, because a retired address is a courtesy with an
end. What must never happen is one of them answering with data: the
tables they read are gone, so a reply could only be wrong.
"""

from __future__ import annotations

import pytest

#: A deleted address, and a body that used to be valid there. Sending
#: the old body still gets 404: the address is unknown, so nothing
#: reaches a validator that could complain about the request instead.
RETIRED: list[tuple[str, str, dict[str, object] | None]] = [
    ("get", "/api/sites", None),
    (
        "post",
        "/api/sites",
        {"name": "Ward 1", "type": "ward", "organisation_id": 1},
    ),
    ("get", "/api/sites/1", None),
    ("put", "/api/sites/1", {"name": "Ward 2"}),
    ("patch", "/api/sites/1/active", {"is_active": False}),
    ("delete", "/api/sites/1", None),
    ("post", "/api/organisations/1/sites/2", None),
    ("delete", "/api/organisations/1/sites/2", None),
    ("get", "/api/sites/1/links", None),
    (
        "post",
        "/api/sites/1/links",
        {"target_id": 2, "relation": "teaches_at"},
    ),
    ("delete", "/api/sites/1/links/2", None),
    ("post", "/api/sites/1/staff", {"user_id": 2, "role": "staff"}),
    ("delete", "/api/sites/1/staff/2", None),
    ("get", "/api/organisations", None),
    ("post", "/api/organisations", {"name": "A Trust", "type": "hospital"}),
    ("get", "/api/organisations/1", None),
    ("put", "/api/organisations/1", {"name": "Renamed"}),
    ("delete", "/api/organisations/1", None),
    ("post", "/api/organisations/1/staff", {"user_id": 2}),
    ("delete", "/api/organisations/1/staff/2", None),
    ("post", "/api/organisations/1/patients", {"patient_id": "p1"}),
    ("delete", "/api/organisations/1/patients/p1", None),
    ("get", "/api/organisations/1/features", None),
    ("put", "/api/organisations/1/features/teaching", {"enabled": True}),
]


@pytest.mark.parametrize("method,path,body", RETIRED)
def test_the_address_no_longer_exists(
    authenticated_superadmin_client,
    method: str,
    path: str,
    body: dict[str, object] | None,
) -> None:
    call = getattr(authenticated_superadmin_client, method)
    resp = call(path) if body is None else call(path, json=body)

    assert resp.status_code == 404, resp.text


def test_it_answers_the_same_to_somebody_with_no_permissions(
    authenticated_client,
) -> None:
    """A deleted address has nothing left to protect.

    Answering 403 to one caller and 404 to another would only tell them
    apart, and there is no longer anything behind the door.
    """
    resp = authenticated_client.get("/api/sites")

    assert resp.status_code == 404
