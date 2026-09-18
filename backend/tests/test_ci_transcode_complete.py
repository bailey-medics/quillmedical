"""Tests for the transcode completion callback.

This endpoint is the join that makes the video pipeline work end to end.
The backend fires the transcode job and deliberately does not wait, so
until this call lands nothing knows the job finished: ``transcoded_at``
stays null and the availability gate hides a module whose renditions are
sitting in the bucket.

What is tested is the authorisation boundary — it is reachable without a
session, so the token is the whole of it — and the mapping from reported
filenames to rendition columns, which is the part that would fail
silently if it drifted.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching.models import ModuleMediaLink

ENDPOINT = "/api/ci/teaching/transcode-complete"

TOKEN = "callback-token-for-tests"


def _body(**overrides: object) -> dict[str, object]:
    """A well-formed report, which individual tests vary."""
    body: dict[str, object] = {
        "org_id": 1,
        "module_id": "test-bank",
        "asset_id": "asset-1",
        "outputs": [
            "asset-1-720p.mp4",
            "asset-1-1080p.mp4",
            "asset-1-poster.jpg",
        ],
    }
    body.update(overrides)
    return body


@pytest.fixture
def link(db_session: Session) -> ModuleMediaLink:
    """An uploaded asset whose job has not yet reported."""
    row = ModuleMediaLink(
        organisation_id=1,
        org_unit_id=1,
        question_bank_id="test-bank",
        media_key="lecture-01",
        asset_id="asset-1",
        original_filename="lecture.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        uploaded_at=datetime.now(UTC),
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    return row


@pytest.fixture
def configured(monkeypatch) -> None:
    """A token set on both ends, as Terraform arranges in teaching."""
    monkeypatch.setattr(
        settings, "TEACHING_TRANSCODE_CALLBACK_TOKEN", SecretStr(TOKEN)
    )


def _post(client: TestClient, token: str | None = TOKEN, **overrides: object):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post(ENDPOINT, json=_body(**overrides), headers=headers)


class TestAuthorisation:
    """The token is the entire boundary — there is no session here."""

    def test_unconfigured_refuses(
        self, test_client: TestClient, monkeypatch
    ) -> None:
        # Development, where nothing calls this and no secret exists.
        # Refused rather than allowed through, so a misconfigured
        # deployment cannot be written to by anyone who finds the path.
        monkeypatch.setattr(
            settings, "TEACHING_TRANSCODE_CALLBACK_TOKEN", None
        )
        assert _post(test_client).status_code == 503

    def test_missing_bearer_token(
        self, test_client: TestClient, configured
    ) -> None:
        assert _post(test_client, token=None).status_code == 401

    def test_wrong_token(self, test_client: TestClient, configured) -> None:
        assert _post(test_client, token="not-the-token").status_code == 401

    def test_a_valid_token_is_accepted(
        self, test_client: TestClient, configured, link
    ) -> None:
        assert _post(test_client).status_code == 200


class TestRecordingCompletion:
    """What the callback writes, and what the gate then reads."""

    def test_sets_transcoded_at(
        self, test_client: TestClient, configured, link, db_session
    ) -> None:
        # The column the availability gate reads. Null before, set after
        # — this single field is what moves a module from hidden to
        # servable.
        assert link.transcoded_at is None

        assert _post(test_client).status_code == 200

        db_session.refresh(link)
        assert link.transcoded_at is not None

    def test_maps_filenames_to_rendition_flags(
        self, test_client: TestClient, configured, link, db_session
    ) -> None:
        resp = _post(test_client)

        db_session.refresh(link)
        assert link.has_1080p is True
        assert link.has_poster is True
        # Not reported, so not set: captions come from a second job.
        assert link.has_captions is False
        assert set(resp.json()["flags"]) == {"has_1080p", "has_poster"}

    def test_a_missing_rendition_leaves_its_flag_false(
        self, test_client: TestClient, configured, link, db_session
    ) -> None:
        # A source smaller than 1080p produces no 1080p rendition, which
        # is ordinary rather than a failure.
        _post(test_client, outputs=["asset-1-720p.mp4"])

        db_session.refresh(link)
        assert link.has_1080p is False
        assert link.has_poster is False
        assert link.transcoded_at is not None

    def test_captions_are_recognised_when_present(
        self, test_client: TestClient, configured, link, db_session
    ) -> None:
        _post(
            test_client,
            outputs=["asset-1-720p.mp4", "asset-1.vtt"],
        )

        db_session.refresh(link)
        assert link.has_captions is True

    def test_is_idempotent(
        self, test_client: TestClient, configured, link, db_session
    ) -> None:
        # Re-running a job by hand is the remedy when something went
        # wrong, so a second identical report must be harmless.
        _post(test_client)
        db_session.refresh(link)
        first = link.transcoded_at

        assert _post(test_client).status_code == 200

        db_session.refresh(link)
        assert link.has_1080p is True
        assert link.transcoded_at is not None
        assert first is not None

    def test_a_rerun_clears_a_flag_no_longer_produced(
        self, test_client: TestClient, configured, link, db_session
    ) -> None:
        # The flags describe what is in the bucket now, not what has
        # ever been there. A re-encode that produced no 1080p must not
        # leave the player asking for one.
        _post(test_client)
        db_session.refresh(link)
        assert link.has_1080p is True

        _post(test_client, outputs=["asset-1-720p.mp4"])

        db_session.refresh(link)
        assert link.has_1080p is False


class TestUnknownAsset:
    """A link row deleted while the job ran."""

    def test_unknown_asset_is_404(
        self, test_client: TestClient, configured
    ) -> None:
        assert _post(test_client, asset_id="never-existed").status_code == 404

    def test_another_organisation_is_404(
        self, test_client: TestClient, configured, link
    ) -> None:
        # The ids must match the row the job was invoked for. A report
        # naming a different organisation finds nothing rather than
        # writing to a row it was not about.
        assert _post(test_client, org_id=999).status_code == 404


CAPTION_ENDPOINT = "/api/ci/teaching/caption-complete"


def _post_caption(client: TestClient, token: str | None = TOKEN, **overrides):
    body = {"org_id": 1, "module_id": "test-bank", "asset_id": "asset-1"}
    body.update(overrides)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post(CAPTION_ENDPOINT, json=body, headers=headers)


class TestCaptionCallback:
    """The caption job's own report, deliberately a separate endpoint."""

    def test_unconfigured_refuses(
        self, test_client: TestClient, monkeypatch
    ) -> None:
        monkeypatch.setattr(
            settings, "TEACHING_TRANSCODE_CALLBACK_TOKEN", None
        )
        assert _post_caption(test_client).status_code == 503

    def test_wrong_token(self, test_client: TestClient, configured) -> None:
        assert _post_caption(test_client, token="nope").status_code == 401

    def test_sets_has_captions(
        self, test_client: TestClient, configured, link, db_session
    ) -> None:
        assert link.has_captions is False

        assert _post_caption(test_client).status_code == 200

        db_session.refresh(link)
        assert link.has_captions is True

    def test_it_does_not_disturb_the_other_flags(
        self, test_client: TestClient, configured, link, db_session
    ) -> None:
        """The reason this is not a mode of the transcode callback.

        That endpoint rewrites every rendition flag from the list it is
        given, so a caption-only report sent there would clear
        has_1080p and has_poster and stamp a transcode that never ran.
        """
        _post(test_client)
        db_session.refresh(link)
        transcoded = link.transcoded_at

        _post_caption(test_client)

        db_session.refresh(link)
        assert link.has_1080p is True
        assert link.has_poster is True
        assert link.transcoded_at == transcoded

    def test_it_never_claims_a_human_review(
        self, test_client: TestClient, configured, link, db_session
    ) -> None:
        """`captions_reviewed_at` says a person read the text. Whisper
        finishing is not that."""
        _post_caption(test_client)

        db_session.refresh(link)
        assert link.captions_reviewed_at is None

    def test_unknown_asset_is_404(
        self, test_client: TestClient, configured
    ) -> None:
        assert _post_caption(test_client, asset_id="nope").status_code == 404
