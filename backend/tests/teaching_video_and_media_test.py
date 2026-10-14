"""A module's video, for the learner and the administrator, by route.

``POST /modules/{module_id}/video-access`` is the learner's: whether
they may watch a module's video, and what they are handed to do it
with. The rest are the administrator's, under
``/admin/modules/{module_id}/media``: where an upload goes, linking it,
sending its bytes through the application, removing it and correcting
its captions.

The rules are tested on their own in
``app/features/teaching/module_content_test.py`` and
``media_uploads_test.py``; this says what a caller is told, in which
words, and what each route's answer is scoped to.

- **A grant is one module at one organisation.** The learner's cookie
  covers the module's files under the storage prefix of the
  organisation that makes it visible to them, and nothing else.
- **An administrator names no organisation.** Every route acts on the
  organisation the caller belongs to, so another organisation's uploads
  are not found.
- **No name the caller sends becomes part of where a file is stored.**
  The asset id is made by the application.
"""

from __future__ import annotations

import base64
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching.enrolment import withdraw
from app.features.teaching.models import (
    ModuleMediaLink,
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.features.teaching.object_paths import media_object_path
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import join_for_teaching, withhold

MODULE = "polyps"
OTHER_MODULE = "bleeding"
ACCESS = f"/api/teaching/modules/{MODULE}/video-access"
MEDIA = f"/api/teaching/admin/modules/{MODULE}/media"
VIDEO_BASE = "https://video.example.test/videos"

PASSWORD = "Password123!"  # noqa: S105

MODULE_NOT_FOUND = {"detail": "Module not found"}
NO_SUCH_ASSET = {"detail": "No such media asset"}
NOT_DELETED = {"detail": "The video could not be deleted"}
UPLOAD_NOT_CONFIGURED = {"detail": "Media upload is not configured"}
UNSUPPORTED_TYPE = {
    "detail": (
        "Unsupported type (allowed: video/mp4, video/quicktime, video/webm)"
    )
}
CAPTIONS = "WEBVTT\n\n00:00.000 --> 00:02.000\nThe caecum."


def _teaching_org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()
    db.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db.commit()
    db.refresh(org)

    return org


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _teaching_org(db_session, "Our Trust")


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """An organisation the caller does not belong to."""
    return _teaching_org(db_session, "Another Trust")


def _user(db: Session, name: str, profession: str) -> User:
    user = User(
        username=name,
        email=f"{name}@test.local",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.flush()

    return user


def _serve(db: Session, org: OrgUnit, *, is_live: bool = True) -> None:
    """Have *org* serve the module, with one version synced into it."""
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=MODULE,
            is_live=is_live,
            active_version=1,
        )
    )
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=MODULE,
            version=1,
            title="Polyps",
            description="A question bank.",
            type="uniform",
            config_yaml={"id": MODULE},
        )
    )
    db.flush()


def _learner(db: Session, org: OrgUnit) -> User:
    """A delegate with a place at *org*, enrolled on what it serves now."""
    user = _user(db, "learner", "teaching_delegate")
    join_for_teaching(db, org.id, user.id, "trainee")
    db.commit()

    return user


@pytest.fixture
def admin(db_session: Session, trust: OrgUnit) -> User:
    """A teaching admin who belongs to the trust."""
    user = _user(db_session, "coordinator", "teaching_admin")
    add_org_unit_member(db_session, trust.id, user.id, "staff")
    db_session.commit()

    return user


def _login(client: TestClient, user: User) -> dict[str, str]:
    """Sign in, and give the header a route that changes something needs."""
    response = client.post(
        "/api/auth/login",
        json={"username": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text

    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


def _media_complete(
    monkeypatch: pytest.MonkeyPatch, complete: bool = True
) -> list[tuple[int, str]]:
    """Answer whether the module has all its media, noting who was asked of."""
    asked: list[tuple[int, str]] = []

    def is_complete(db: Session, organisation_id: int, module_id: str) -> bool:
        asked.append((organisation_id, module_id))

        return complete

    monkeypatch.setattr(
        "app.features.teaching.media.module_media_is_complete", is_complete
    )

    return asked


def _video_served_from_the_edge(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set what signing a grant needs: where video is, and a key."""
    key = base64.urlsafe_b64encode(b"sixteen byte key").decode("ascii")
    monkeypatch.setattr(settings, "TEACHING_VIDEO_BASE_URL", VIDEO_BASE)
    monkeypatch.setattr(settings, "TEACHING_VIDEO_SIGNING_KEY_NAME", "a-key")
    monkeypatch.setattr(settings, "TEACHING_VIDEO_SIGNING_KEY", SecretStr(key))
    monkeypatch.setattr(settings, "TEACHING_VIDEO_COOKIE_TTL_MINUTES", 30)


def _video_served_locally(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TEACHING_VIDEO_BASE_URL", None)
    monkeypatch.setattr(settings, "TEACHING_VIDEO_SIGNING_KEY_NAME", None)
    monkeypatch.setattr(settings, "TEACHING_VIDEO_SIGNING_KEY", None)


def _granted_prefix(set_cookie: str) -> str:
    """The address a ``Cloud-CDN-Cookie`` header's grant covers."""
    value = set_cookie.split(";")[0].removeprefix("Cloud-CDN-Cookie=")
    encoded = value.split(":")[0].removeprefix("URLPrefix=")
    padded = encoded + "=" * (-len(encoded) % 4)

    return base64.urlsafe_b64decode(padded).decode("utf-8")


def _upload(
    db: Session,
    org: OrgUnit,
    *,
    asset_id: str = "asset1",
    media_key: str = "lecture-01",
) -> None:
    """An upload already linked at *org*."""
    db.add(
        ModuleMediaLink(
            org_unit_id=org.id,
            question_bank_id=MODULE,
            media_key=media_key,
            asset_id=asset_id,
            original_filename="lecture.mp4",
            content_type="video/mp4",
            size_bytes=1024,
            uploaded_at=datetime.now(UTC),
        )
    )
    db.commit()


def _links(db: Session) -> list[ModuleMediaLink]:
    db.expire_all()

    return list(
        db.execute(select(ModuleMediaLink).order_by(ModuleMediaLink.id))
        .scalars()
        .all()
    )


def _source_bucket(monkeypatch: pytest.MonkeyPatch, name: str | None) -> None:
    monkeypatch.setattr(settings, "TEACHING_VIDEOS_SOURCE_BUCKET", name)


def _content_path(monkeypatch: pytest.MonkeyPatch, path: str | None) -> None:
    monkeypatch.setattr(settings, "TEACHING_QUESTION_BANK_PATH", path)


def _module_on_disk(tmp_path: Path) -> Path:
    module = tmp_path / "content-repo" / "modules" / MODULE
    module.mkdir(parents=True)
    (module / "module.yaml").write_text("title: Polyps\n", encoding="utf-8")

    return module


# --- POST /modules/{module_id}/video-access ---------------------------------


def test_a_learner_is_granted_one_module_at_their_own_organisation(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    _video_served_from_the_edge(monkeypatch)
    asked = _media_complete(monkeypatch)

    resp = test_client.post(ACCESS, headers=_login(test_client, learner))

    assert resp.status_code == 200, resp.text
    assert resp.json()["base_url"] == f"{VIDEO_BASE}/{trust.id}/{MODULE}"
    assert asked == [(trust.id, MODULE)]

    set_cookie = resp.headers["set-cookie"]

    # The closing slash is what stops the grant covering "polyps-2" too.
    assert _granted_prefix(set_cookie) == f"{VIDEO_BASE}/{trust.id}/{MODULE}/"
    assert set_cookie.startswith("Cloud-CDN-Cookie=URLPrefix=")
    assert ":KeyName=a-key:Signature=" in set_cookie
    # Half an hour, sent only for video, to this host alone, and out of
    # reach of the page's own script.
    assert set_cookie.endswith(
        "; Max-Age=1800; Path=/videos/; Secure; HttpOnly; SameSite=Lax"
    )
    assert "Domain" not in set_cookie


def test_a_grant_is_under_the_prefix_the_organisation_records(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    trust.media_prefix_id = 4242
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    _video_served_from_the_edge(monkeypatch)
    _media_complete(monkeypatch)

    resp = test_client.post(ACCESS, headers=_login(test_client, learner))

    assert resp.json()["base_url"] == f"{VIDEO_BASE}/4242/{MODULE}"
    assert (
        _granted_prefix(resp.headers["set-cookie"])
        == f"{VIDEO_BASE}/4242/{MODULE}/"
    )


def test_with_no_signing_key_the_learner_is_sent_to_the_local_route(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    _video_served_locally(monkeypatch)
    _media_complete(monkeypatch)

    resp = test_client.post(ACCESS, headers=_login(test_client, learner))

    assert resp.status_code == 200, resp.text
    assert resp.json()["base_url"] == f"/api/teaching/videos/{MODULE}"
    assert "Cloud-CDN-Cookie" not in resp.headers.get("set-cookie", "")


def _refused_with_nothing_granted(
    client: TestClient, headers: dict[str, str]
) -> None:
    resp = client.post(ACCESS, headers=headers)

    assert resp.status_code == 404
    assert resp.json() == MODULE_NOT_FOUND
    assert "Cloud-CDN-Cookie" not in resp.headers.get("set-cookie", "")


def test_the_video_of_a_module_only_another_organisation_serves_is_refused(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(db_session, other_trust)
    learner = _learner(db_session, trust)
    _video_served_from_the_edge(monkeypatch)
    asked = _media_complete(monkeypatch)

    _refused_with_nothing_granted(test_client, _login(test_client, learner))
    # Refused before anything is asked of the content.
    assert asked == []


def test_the_video_of_a_module_that_is_not_live_is_refused(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(db_session, trust, is_live=False)
    learner = _learner(db_session, trust)
    _video_served_from_the_edge(monkeypatch)
    _media_complete(monkeypatch)

    _refused_with_nothing_granted(test_client, _login(test_client, learner))


def test_the_video_of_a_module_whose_enrolment_has_ended_is_refused(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    withdraw(
        db_session, learner.id, org_unit_id=trust.id, question_bank_id=MODULE
    )
    db_session.commit()
    _video_served_from_the_edge(monkeypatch)
    _media_complete(monkeypatch)

    _refused_with_nothing_granted(test_client, _login(test_client, learner))


def test_a_member_with_no_place_to_take_modules_is_refused_the_video(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Belonging to the organisation is not enough without a place there."""
    _serve(db_session, trust)
    member = _user(db_session, "member", "teaching_delegate")
    add_org_unit_member(db_session, trust.id, member.id, "trainee")
    db_session.commit()
    _video_served_from_the_edge(monkeypatch)
    _media_complete(monkeypatch)

    _refused_with_nothing_granted(test_client, _login(test_client, member))


def test_the_video_of_a_module_missing_some_of_its_media_is_refused(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The same words as a module that is not theirs."""
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    _video_served_from_the_edge(monkeypatch)
    asked = _media_complete(monkeypatch, complete=False)

    _refused_with_nothing_granted(test_client, _login(test_client, learner))
    assert asked == [(trust.id, MODULE)]


def test_the_video_of_a_module_nobody_serves_is_refused(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    learner = _learner(db_session, trust)
    _video_served_from_the_edge(monkeypatch)
    _media_complete(monkeypatch)

    _refused_with_nothing_granted(test_client, _login(test_client, learner))


def test_somebody_who_may_not_take_modules_is_refused_the_video(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A place and an enrolment are not enough without the competency."""
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    withhold(learner, "take_teaching_modules")
    db_session.commit()
    _video_served_from_the_edge(monkeypatch)
    _media_complete(monkeypatch)

    resp = test_client.post(ACCESS, headers=_login(test_client, learner))

    assert resp.status_code == 403
    assert "Cloud-CDN-Cookie" not in resp.headers.get("set-cookie", "")


# --- POST /admin/modules/{module_id}/media/upload-url -----------------------

UPLOAD_URL = f"{MEDIA}/upload-url"


def _upload_request(**over: object) -> dict[str, object]:
    body: dict[str, object] = {
        "media_key": "lecture-01",
        "original_filename": "Colonoscopy FINAL v3.mp4",
        "content_type": "video/mp4",
        "size_bytes": 943718400,
    }
    body.update(over)

    return body


def _signing_uploads(
    monkeypatch: pytest.MonkeyPatch,
) -> list[tuple[str, int, str, str, str]]:
    """Stand in for signing an upload address, noting what was asked for.

    The path is still built by the real builder, so an id it refuses is
    refused here as it would be before anything was signed.
    """
    asked: list[tuple[str, int, str, str, str]] = []

    def sign(
        bucket: str,
        org_id: int,
        module_id: str,
        asset_id: str,
        content_type: str,
    ) -> str:
        path = media_object_path(org_id, module_id, asset_id)
        asked.append((bucket, org_id, module_id, asset_id, content_type))

        return f"https://upload.example.test/{bucket}/{path}"

    monkeypatch.setattr(
        "app.features.teaching.storage.create_resumable_upload_url", sign
    )

    return asked


def test_an_upload_is_addressed_by_an_id_made_here_under_the_callers_trust(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _source_bucket(monkeypatch, "source")
    asked = _signing_uploads(monkeypatch)

    resp = test_client.post(
        UPLOAD_URL,
        json=_upload_request(),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 200, resp.text

    asset_id = resp.json()["asset_id"]

    assert asked == [("source", trust.id, MODULE, asset_id, "video/mp4")]
    assert resp.json()["upload_url"] == (
        f"https://upload.example.test/source/{trust.id}/{MODULE}/{asset_id}"
    )
    # Neither the file's name nor the reference it is for is any part
    # of where it is stored.
    assert "Colonoscopy" not in resp.json()["upload_url"]
    assert "lecture-01" not in resp.json()["upload_url"]
    assert len(asset_id) == 32


def test_an_upload_is_filed_under_the_prefix_the_callers_trust_records(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    trust.media_prefix_id = 4242
    db_session.commit()
    _source_bucket(monkeypatch, "source")
    asked = _signing_uploads(monkeypatch)

    resp = test_client.post(
        UPLOAD_URL,
        json=_upload_request(),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 200, resp.text
    assert [org_id for _, org_id, _, _, _ in asked] == [4242]


def test_a_module_id_that_cannot_be_part_of_a_path_gets_no_upload_address(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _source_bucket(monkeypatch, "source")
    asked = _signing_uploads(monkeypatch)

    resp = test_client.post(
        "/api/teaching/admin/modules/not.safe/media/upload-url",
        json=_upload_request(),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 404
    assert resp.json() == MODULE_NOT_FOUND
    assert asked == []


def test_with_no_bucket_the_upload_is_sent_back_through_the_application(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))

    resp = test_client.post(
        UPLOAD_URL,
        json=_upload_request(),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["upload_url"] == (
        f"{MEDIA}/{resp.json()['asset_id']}/content"
    )


def test_with_neither_a_bucket_nor_a_content_path_no_upload_is_offered(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, None)

    resp = test_client.post(
        UPLOAD_URL,
        json=_upload_request(),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 503
    assert resp.json() == UPLOAD_NOT_CONFIGURED


def test_a_file_of_a_kind_not_on_the_list_is_refused_naming_the_list(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Refused by the route, before the configuration is looked at."""
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, None)

    resp = test_client.post(
        UPLOAD_URL,
        json=_upload_request(original_filename="../../notes.pdf"),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 400
    assert resp.json() == {
        "detail": "Unsupported file type (allowed: .mov, .mp4, .webm)"
    }


def test_a_type_that_does_not_match_the_file_is_refused_naming_both(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The words carry the file's suffix, in lower case, and no more of it.

    The suffix is one of the three on the list by the time it is
    repeated: any other was refused the line before.
    """
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, None)

    resp = test_client.post(
        UPLOAD_URL,
        json=_upload_request(
            original_filename="A Patient Name.MP4",
            content_type="application/x-sh",
        ),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 400
    assert resp.json() == {
        "detail": "Content type does not match .mp4 (expected video/mp4)"
    }


# --- POST /admin/modules/{module_id}/media/{media_key}/link -----------------

LINK = f"{MEDIA}/lecture-01/link"


def _link_request(**over: object) -> dict[str, object]:
    body: dict[str, object] = {
        "asset_id": "asset1",
        "original_filename": "Colonoscopy FINAL v3.mp4",
        "content_type": "video/mp4",
        "size_bytes": 943718400,
    }
    body.update(over)

    return body


def test_linking_writes_to_the_callers_trust_and_no_other(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
    admin: User,
) -> None:
    _upload(db_session, other_trust, asset_id="theirs")

    resp = test_client.post(
        LINK, json=_link_request(), headers=_login(test_client, admin)
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["asset_id"] == "asset1"
    assert [
        (row.org_unit_id, row.organisation_id, row.asset_id, row.uploaded_by)
        for row in _links(db_session)
    ] == [
        (other_trust.id, other_trust.id, "theirs", None),
        (trust.id, trust.id, "asset1", admin.id),
    ]


def test_a_type_not_on_the_list_is_not_linked(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
) -> None:
    resp = test_client.post(
        LINK,
        json=_link_request(content_type="application/x-sh"),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 400
    assert resp.json() == UNSUPPORTED_TYPE
    assert _links(db_session) == []


@pytest.mark.parametrize("size_bytes", [-1, 0, 10**15])
def test_a_link_records_whatever_size_it_is_told(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    size_bytes: int,
) -> None:
    """Found, and not changed: no size is refused, here or at upload.

    The size is what the caller says it is. Nothing compares it with a
    limit or with the file.
    """
    resp = test_client.post(
        LINK,
        json=_link_request(size_bytes=size_bytes),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["size_bytes"] == size_bytes


def test_a_module_the_callers_trust_does_not_hold_can_be_linked_to(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
) -> None:
    """The module is not looked up: an upload may come before its pages."""
    resp = test_client.post(
        f"/api/teaching/admin/modules/{OTHER_MODULE}/media/lecture-01/link",
        json=_link_request(),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 200, resp.text
    assert [
        (row.org_unit_id, row.question_bank_id) for row in _links(db_session)
    ] == [(trust.id, OTHER_MODULE)]


# --- PUT /admin/modules/{module_id}/media/{asset_id}/content ----------------


def _send(
    client: TestClient,
    headers: dict[str, str],
    *,
    asset_id: str = "abc123",
    content_type: str = "video/mp4",
    module_id: str = MODULE,
) -> tuple[int, object]:
    resp = client.put(
        f"/api/teaching/admin/modules/{module_id}/media/{asset_id}/content",
        content=b"video",
        headers={**headers, "Content-Type": content_type},
    )

    return resp.status_code, resp.json() if resp.content else None


def test_bytes_sent_through_the_application_land_in_the_modules_folder(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    module = _module_on_disk(tmp_path)
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))

    assert _send(test_client, _login(test_client, admin)) == (204, None)
    assert (module / "learning" / "abc123.mp4").read_bytes() == b"video"


def test_bytes_are_not_taken_through_the_application_beside_a_bucket(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Said first, before the type or the id is looked at."""
    module = _module_on_disk(tmp_path)
    _source_bucket(monkeypatch, "source")
    _content_path(monkeypatch, str(tmp_path))

    sent = _send(
        test_client,
        _login(test_client, admin),
        content_type="application/x-sh",
    )

    assert sent == (404, {"detail": "Not found"})
    assert not (module / "learning").exists()


def test_bytes_are_not_taken_with_no_content_path_to_put_them_under(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, None)

    sent = _send(test_client, _login(test_client, admin))

    assert sent == (503, UPLOAD_NOT_CONFIGURED)


def test_bytes_of_a_type_not_on_the_list_are_refused_before_the_id_is_read(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _module_on_disk(tmp_path)
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))

    sent = _send(
        test_client,
        _login(test_client, admin),
        asset_id="not.safe",
        content_type="application/x-sh",
    )

    assert sent == (400, UNSUPPORTED_TYPE)


def test_bytes_for_an_id_that_cannot_be_a_file_name_are_refused(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    module = _module_on_disk(tmp_path)
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))

    sent = _send(test_client, _login(test_client, admin), asset_id="not.safe")

    assert sent == (400, {"detail": "Invalid asset id"})
    assert not (module / "learning").exists()


def test_bytes_for_a_module_that_is_not_on_disk_are_refused(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _module_on_disk(tmp_path)
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))

    sent = _send(
        test_client, _login(test_client, admin), module_id=OTHER_MODULE
    )

    assert sent == (404, MODULE_NOT_FOUND)


def test_bytes_are_taken_from_a_teaching_admin_who_belongs_to_no_trust(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Found, and not changed: this route asks for no organisation.

    Every other media route refuses a caller who belongs to no
    organisation. This one writes the file for anybody holding
    ``manage_teaching`` where teaching is on, into whichever module on
    disk they name. It exists only where there is no bucket.
    """
    ward = OrgUnit(name="Ward 9", type="ward", parent_id=trust.id)
    db_session.add(ward)
    db_session.flush()
    outsider = _user(db_session, "ward_coordinator", "teaching_admin")
    add_org_unit_member(db_session, ward.id, outsider.id, "staff")
    db_session.commit()
    module = _module_on_disk(tmp_path)
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))
    headers = _login(test_client, outsider)

    refused = test_client.post(LINK, json=_link_request(), headers=headers)

    assert refused.status_code == 403
    assert refused.json() == {
        "detail": "User is not a member of any organisation"
    }
    assert _send(test_client, headers) == (204, None)
    assert (module / "learning" / "abc123.mp4").is_file()


# --- DELETE /admin/modules/{module_id}/media/{asset_id} ---------------------


def _bucket_deleting(
    monkeypatch: pytest.MonkeyPatch,
) -> list[tuple[str, int, str, str]]:
    asked: list[tuple[str, int, str, str]] = []

    def delete(
        bucket: str, org_id: int, module_id: str, asset_id: str
    ) -> None:
        asked.append((bucket, org_id, module_id, asset_id))

    monkeypatch.setattr(
        "app.features.teaching.storage.delete_media_object", delete
    )

    return asked


def test_an_administrator_deletes_an_upload_of_their_own_trust(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _upload(db_session, trust)
    _source_bucket(monkeypatch, "source")
    asked = _bucket_deleting(monkeypatch)

    resp = test_client.delete(
        f"{MEDIA}/asset1", headers=_login(test_client, admin)
    )

    assert resp.status_code == 204
    assert _links(db_session) == []
    assert asked == [("source", trust.id, MODULE, "asset1")]


def test_an_upload_of_another_trust_is_not_found_and_not_deleted(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _upload(db_session, other_trust)
    _source_bucket(monkeypatch, "source")
    asked = _bucket_deleting(monkeypatch)

    resp = test_client.delete(
        f"{MEDIA}/asset1", headers=_login(test_client, admin)
    )

    assert resp.status_code == 404
    assert resp.json() == NO_SUCH_ASSET
    assert [row.org_unit_id for row in _links(db_session)] == [other_trust.id]
    assert asked == []


def test_an_upload_nobody_holds_is_not_found_in_the_same_words(
    test_client: TestClient,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _source_bucket(monkeypatch, "source")
    asked = _bucket_deleting(monkeypatch)

    resp = test_client.delete(
        f"{MEDIA}/no-such-asset", headers=_login(test_client, admin)
    )

    assert resp.status_code == 404
    assert resp.json() == NO_SUCH_ASSET
    assert asked == []


def _both_buckets_deleting(
    monkeypatch: pytest.MonkeyPatch,
) -> list[tuple[str, str]]:
    """Each file either bucket was asked to remove: the bucket and the path."""
    asked: list[tuple[str, str]] = []

    def delete(
        bucket: str, org_id: int, module_id: str, asset_id: str
    ) -> None:
        asked.append((bucket, f"{org_id}/{module_id}/{asset_id}"))

    def delete_processed(
        bucket: str, org_id: int, module_id: str, asset_id: str, suffix: str
    ) -> None:
        asked.append((bucket, f"{org_id}/{module_id}/{asset_id}{suffix}"))

    _source_bucket(monkeypatch, "source")
    monkeypatch.setattr(settings, "TEACHING_VIDEOS_BUCKET", "processed")
    monkeypatch.setattr(
        "app.features.teaching.storage.delete_media_object", delete
    )
    monkeypatch.setattr(
        "app.features.teaching.storage.delete_processed_media_object",
        delete_processed,
    )

    return asked


def _every_file_of(org: OrgUnit, asset_id: str) -> list[tuple[str, str]]:
    stem = f"{org.id}/{MODULE}/{asset_id}"

    return [
        ("source", stem),
        ("processed", f"{stem}-720p.mp4"),
        ("processed", f"{stem}-1080p.mp4"),
        ("processed", f"{stem}-poster.jpg"),
        ("processed", f"{stem}.vtt"),
    ]


def test_deleting_a_video_removes_its_renditions_poster_and_captions_too(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _upload(db_session, trust)
    asked = _both_buckets_deleting(monkeypatch)

    resp = test_client.delete(
        f"{MEDIA}/asset1", headers=_login(test_client, admin)
    )

    assert resp.status_code == 204
    assert _links(db_session) == []
    assert asked == _every_file_of(trust, "asset1")


@pytest.mark.parametrize(
    "refusing", ["delete_media_object", "delete_processed_media_object"]
)
def test_a_bucket_that_refuses_is_answered_502_and_the_row_stays(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
    refusing: str,
) -> None:
    """The caller is told in fixed words, and nothing is committed.

    Nothing of what the bucket said reaches them.
    """
    _upload(db_session, trust)
    _both_buckets_deleting(monkeypatch)

    def refuse(*args: object) -> None:
        raise RuntimeError("the bucket said no")

    monkeypatch.setattr(f"app.features.teaching.storage.{refusing}", refuse)

    resp = test_client.delete(
        f"{MEDIA}/asset1", headers=_login(test_client, admin)
    )

    assert resp.status_code == 502
    assert resp.json() == NOT_DELETED
    assert [row.asset_id for row in _links(db_session)] == ["asset1"]


def test_an_upload_whose_id_cannot_be_a_path_is_deleted_and_no_bucket_asked(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Was a 500 on every try, so the row could never be removed."""
    _upload(db_session, trust, asset_id="not.safe")
    asked = _both_buckets_deleting(monkeypatch)

    resp = test_client.delete(
        f"{MEDIA}/not.safe", headers=_login(test_client, admin)
    )

    assert resp.status_code == 204
    assert _links(db_session) == []
    assert asked == []


def test_linking_a_new_video_over_an_old_one_starts_clean(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Nothing the old video's jobs or its reviewer recorded is kept.

    The old video's files are removed, and none of the new one's.
    """
    _upload(db_session, trust, asset_id="old")
    old = _links(db_session)[0]
    old.transcoded_at = datetime(2026, 1, 1, tzinfo=UTC)
    old.has_1080p = True
    old.has_poster = True
    old.has_captions = True
    old.transcode_started_at = datetime(2026, 1, 1, tzinfo=UTC)
    old.caption_started_at = datetime(2026, 1, 1, tzinfo=UTC)
    old.captions_reviewed_at = datetime(2026, 1, 2, tzinfo=UTC)
    db_session.commit()
    asked = _both_buckets_deleting(monkeypatch)

    resp = test_client.post(
        LINK,
        json=_link_request(asset_id="new"),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["asset_id"] == "new"
    assert resp.json()["has_captions"] is False
    assert [
        (
            row.asset_id,
            row.transcoded_at,
            row.has_1080p,
            row.has_poster,
            row.has_captions,
            row.transcode_started_at,
            row.caption_started_at,
            row.captions_reviewed_at,
        )
        for row in _links(db_session)
    ] == [("new", None, False, False, False, None, None, None)]
    assert asked == _every_file_of(trust, "old")


def test_old_files_that_will_not_delete_do_not_stop_the_new_video_linking(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _upload(db_session, trust, asset_id="old")
    _both_buckets_deleting(monkeypatch)

    def refuse(*args: object) -> None:
        raise RuntimeError("the bucket said no")

    monkeypatch.setattr(
        "app.features.teaching.storage.delete_media_object", refuse
    )

    resp = test_client.post(
        LINK,
        json=_link_request(asset_id="new"),
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 200, resp.text
    assert [row.asset_id for row in _links(db_session)] == ["new"]


def test_linking_the_same_upload_again_removes_none_of_its_files(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _upload(db_session, trust)
    asked = _both_buckets_deleting(monkeypatch)

    resp = test_client.post(
        LINK, json=_link_request(), headers=_login(test_client, admin)
    )

    assert resp.status_code == 200, resp.text
    assert [row.asset_id for row in _links(db_session)] == ["asset1"]
    assert asked == []


# --- /admin/modules/{module_id}/media/{asset_id}/captions -------------------


def _captions_bucket(
    monkeypatch: pytest.MonkeyPatch, name: str | None
) -> list[tuple[str, int, str, str, str]]:
    written: list[tuple[str, int, str, str, str]] = []

    def write(
        bucket: str, org_id: int, module_id: str, asset_id: str, text: str
    ) -> None:
        written.append((bucket, org_id, module_id, asset_id, text))

    monkeypatch.setattr(settings, "TEACHING_VIDEOS_BUCKET", name)
    monkeypatch.setattr(
        "app.features.teaching.storage.write_caption_object", write
    )

    return written


def test_saving_captions_writes_them_and_says_when_they_were_checked(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _upload(db_session, trust)
    written = _captions_bucket(monkeypatch, "processed")

    resp = test_client.put(
        f"{MEDIA}/asset1/captions",
        json={"webvtt": f"\n{CAPTIONS}\n"},
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["asset_id"] == "asset1"
    assert resp.json()["webvtt"] == CAPTIONS
    assert resp.json()["reviewed_at"] is not None
    assert written == [("processed", trust.id, MODULE, "asset1", CAPTIONS)]

    row = _links(db_session)[0]

    assert row.has_captions is True
    assert row.captions_reviewed_at is not None


def test_captions_for_an_upload_of_another_trust_are_not_found(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reading and saving answer alike, and nothing is written."""
    _upload(db_session, other_trust)
    written = _captions_bucket(monkeypatch, "processed")
    headers = _login(test_client, admin)

    read = test_client.get(f"{MEDIA}/asset1/captions")
    saved = test_client.put(
        f"{MEDIA}/asset1/captions",
        json={"webvtt": CAPTIONS},
        headers=headers,
    )

    assert (read.status_code, read.json()) == (404, NO_SUCH_ASSET)
    assert (saved.status_code, saved.json()) == (404, NO_SUCH_ASSET)
    assert written == []
    assert _links(db_session)[0].captions_reviewed_at is None


def test_captions_that_do_not_begin_webvtt_are_refused(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Said before a missing bucket is, and nothing is recorded."""
    _upload(db_session, trust)
    written = _captions_bucket(monkeypatch, None)

    resp = test_client.put(
        f"{MEDIA}/asset1/captions",
        json={"webvtt": "1\n00:00 --> 00:02\nHello"},
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 400
    assert resp.json() == {
        "detail": "Captions must be WebVTT, beginning with the line WEBVTT"
    }
    assert written == []
    assert _links(db_session)[0].captions_reviewed_at is None


def test_captions_are_not_saved_where_there_is_no_bucket_for_them(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _upload(db_session, trust)
    written = _captions_bucket(monkeypatch, None)

    resp = test_client.put(
        f"{MEDIA}/asset1/captions",
        json={"webvtt": CAPTIONS},
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 503
    assert resp.json() == {
        "detail": "No video bucket configured; captions cannot be saved"
    }
    assert written == []
    assert _links(db_session)[0].captions_reviewed_at is None


# --- /admin/modules/{module_id}/media/{asset_id}/poster-frame ---------------


def _transcoded(db: Session) -> ModuleMediaLink:
    """Mark the one upload as processed, with a poster, and return it."""
    row = _links(db)[0]
    row.transcoded_at = datetime.now(UTC)
    row.has_poster = True
    db.commit()

    return row


def _poster_jobs(
    monkeypatch: pytest.MonkeyPatch,
) -> list[tuple[tuple[object, ...], dict[str, object]]]:
    started: list[tuple[tuple[object, ...], dict[str, object]]] = []

    def start(*args: object, **kwargs: object) -> str:
        started.append((args, kwargs))

        return "operations/poster"

    monkeypatch.setattr(
        "app.features.teaching.transcode.start_transcode", start
    )

    return started


def test_choosing_a_poster_second_keeps_it_and_retakes_the_poster(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _upload(db_session, trust)
    row = _transcoded(db_session)
    started = _poster_jobs(monkeypatch)

    resp = test_client.put(
        f"{MEDIA}/asset1/poster-frame",
        json={"seconds": 42},
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["poster_at_seconds"] == 42
    assert _links(db_session)[0].poster_at_seconds == 42
    # Under the storage prefix, which the job reads the bucket by, and
    # in the poster-only mode: the source has gone and nothing is
    # re-encoded.
    assert started == [
        (
            (row.organisation_id, MODULE, "asset1"),
            {"poster_at_seconds": 42, "poster_only": True},
        )
    ]


def test_a_poster_cannot_be_chosen_before_the_video_is_ready(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The transcode still running would write its own poster over it."""
    _upload(db_session, trust)
    started = _poster_jobs(monkeypatch)

    resp = test_client.put(
        f"{MEDIA}/asset1/poster-frame",
        json={"seconds": 42},
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 409
    assert _links(db_session)[0].poster_at_seconds is None
    assert started == []


def test_a_poster_for_an_upload_of_another_trust_is_not_found(
    test_client: TestClient,
    db_session: Session,
    other_trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _upload(db_session, other_trust)
    _transcoded(db_session)
    started = _poster_jobs(monkeypatch)

    resp = test_client.put(
        f"{MEDIA}/asset1/poster-frame",
        json={"seconds": 42},
        headers=_login(test_client, admin),
    )

    assert (resp.status_code, resp.json()) == (404, NO_SUCH_ASSET)
    assert _links(db_session)[0].poster_at_seconds is None
    assert started == []


@pytest.mark.parametrize("seconds", [-1, 86_401, 4.5, "soon"])
def test_a_poster_second_out_of_range_is_refused(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
    seconds: object,
) -> None:
    _upload(db_session, trust)
    _transcoded(db_session)
    started = _poster_jobs(monkeypatch)

    resp = test_client.put(
        f"{MEDIA}/asset1/poster-frame",
        json={"seconds": seconds},
        headers=_login(test_client, admin),
    )

    assert resp.status_code == 422
    assert started == []
