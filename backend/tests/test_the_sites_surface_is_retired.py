"""The old sites surface answers 410, not data.

Every place lives at ``/api/org-units`` now. The sites addresses stayed
for a deploy cycle so nothing broke mid-rollout; this is the step where
they stop answering.

410 rather than 404, so a caller can tell "this never existed" from
"this used to be here and has gone" — the second is worth saying,
because it tells them there is somewhere else to look.
"""

from __future__ import annotations

import pytest

#: The retired address, and a body that used to be valid there. The
#: shapes are still declared, so a caller sending what it always sent
#: gets 410 rather than a complaint about its request.
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
]


@pytest.mark.parametrize("method,path,body", RETIRED)
def test_it_says_it_has_gone(
    authenticated_superadmin_client,
    method: str,
    path: str,
    body: dict[str, object] | None,
) -> None:
    call = getattr(authenticated_superadmin_client, method)
    resp = call(path) if body is None else call(path, json=body)

    assert resp.status_code == 410, resp.text


def test_it_says_where_to_go_instead(authenticated_superadmin_client) -> None:
    resp = authenticated_superadmin_client.get("/api/sites")

    assert "/api/org-units" in resp.json()["detail"]


def test_it_answers_the_same_to_somebody_with_no_permissions(
    authenticated_client,
) -> None:
    """A retired address has nothing left to protect.

    Answering 403 to one caller and 410 to another would only tell them
    apart, and there is no longer anything behind the door.
    """
    resp = authenticated_client.get("/api/sites")

    assert resp.status_code == 410
