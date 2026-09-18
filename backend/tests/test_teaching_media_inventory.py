"""Tests for the shared media inventory.

One function answers "which media does this module reference, and which
of those are present" for the admin card, the learner gate and the merge
gate. These tests pin the behaviour all three depend on.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.features.teaching.media import get_media_inventory
from app.features.teaching.models import ModuleMediaLink
from app.models import OrgUnit


def _org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="hospital_team")
    db.add(org)
    db.flush()
    return org


def _upload(
    db: Session,
    org_id: int,
    key: str,
    asset: str,
    *,
    transcoded: bool = True,
) -> ModuleMediaLink:
    """An upload, transcoded by default.

    Default true so the existing tests keep asserting what they were
    written to assert — that a *usable* upload completes a module. The
    window this parameter opens is the new one: uploaded, linked, and
    not yet playable.
    """
    link = ModuleMediaLink(
        org_unit_id=org_id,
        question_bank_id="test-bank",
        media_key=key,
        asset_id=asset,
        original_filename=f"{asset}.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        uploaded_at=datetime.now(UTC),
        transcoded_at=datetime.now(UTC) if transcoded else None,
    )
    db.add(link)
    db.flush()
    return link


class TestMediaInventory:
    def test_a_reference_with_an_upload_is_present(self, db_session: Session):
        org = _org(db_session, "Trust A")
        _upload(db_session, org.id, "lecture-01", "asset-1")

        inv = get_media_inventory(
            db_session, org.id, "test-bank", ["lecture-01"]
        )

        assert inv.is_complete
        assert inv.references[0].is_present
        assert inv.missing_keys == []

    def test_a_reference_without_an_upload_is_missing(
        self, db_session: Session
    ):
        org = _org(db_session, "Trust B")

        inv = get_media_inventory(
            db_session, org.id, "test-bank", ["lecture-01"]
        )

        assert not inv.is_complete
        assert inv.missing_keys == ["lecture-01"]
        assert inv.references[0].link is None

    def test_an_upload_with_no_reference_is_unattached(
        self, db_session: Session
    ):
        """What a renamed or removed reference leaves behind.

        Listing it is what stops the file becoming invisible bytes
        nobody can reach or remove.
        """
        org = _org(db_session, "Trust C")
        _upload(db_session, org.id, "old-name", "asset-1")

        inv = get_media_inventory(
            db_session, org.id, "test-bank", ["new-name"]
        )

        assert [u.media_key for u in inv.unattached] == ["old-name"]
        assert inv.missing_keys == ["new-name"]
        # The file is kept, not deleted, because the reference may return.
        assert not inv.is_complete

    def test_references_keep_their_order(self, db_session: Session):
        """The card's rows follow the content, not the database."""
        org = _org(db_session, "Trust D")
        _upload(db_session, org.id, "b", "asset-b")

        inv = get_media_inventory(
            db_session, org.id, "test-bank", ["a", "b", "c"]
        )

        assert [r.key for r in inv.references] == ["a", "b", "c"]

    def test_another_organisations_upload_does_not_count(
        self, db_session: Session
    ):
        """Completeness is per organisation, like liveness.

        B uploading a file must not make A's module look complete —
        that would serve A's learners a video their organisation never
        uploaded, and break the cookie prefix the access design rests
        on.
        """
        a = _org(db_session, "Trust E")
        b = _org(db_session, "Trust F")
        _upload(db_session, b.id, "lecture-01", "asset-b")

        inv = get_media_inventory(
            db_session, a.id, "test-bank", ["lecture-01"]
        )

        assert not inv.is_complete
        assert inv.missing_keys == ["lecture-01"]

    def test_a_module_with_no_media_is_complete(self, db_session: Session):
        """A module of pure text is not incomplete.

        The admin card is not shown for one, and the learner gate must
        not hide it.
        """
        org = _org(db_session, "Trust G")

        inv = get_media_inventory(db_session, org.id, "test-bank", [])

        assert inv.is_complete
        assert inv.references == []


class TestServableVersusComplete:
    """An upload is not yet a video.

    The transcode job produces what the player asks for, so between the
    link being recorded and the job finishing there is a window where
    the module looks finished to an admin and is unplayable to a
    learner. These two measures are what keep those apart.
    """

    def test_an_upload_awaiting_transcode_is_present_not_servable(
        self, db_session: Session
    ):
        org = _org(db_session, "Trust Waiting")
        _upload(
            db_session,
            org.id,
            "lecture-01",
            "asset-1",
            transcoded=False,
        )

        inv = get_media_inventory(
            db_session, org.id, "test-bank", ["lecture-01"]
        )

        # The admin uploaded it, so nothing is missing from their side.
        assert inv.is_complete
        assert inv.missing_keys == []
        # The learner cannot play it, so the module stays hidden.
        assert not inv.is_servable
        assert inv.awaiting_transcode_keys == ["lecture-01"]

    def test_a_transcoded_upload_is_both(self, db_session: Session):
        org = _org(db_session, "Trust Ready")
        _upload(db_session, org.id, "lecture-01", "asset-1")

        inv = get_media_inventory(
            db_session, org.id, "test-bank", ["lecture-01"]
        )

        assert inv.is_complete
        assert inv.is_servable
        assert inv.awaiting_transcode_keys == []

    def test_a_missing_upload_is_neither(self, db_session: Session):
        """And is not reported as awaiting a transcode.

        The remedies differ — upload it, versus wait for it — so a key
        with no file at all must not appear in the waiting list.
        """
        org = _org(db_session, "Trust Empty")

        inv = get_media_inventory(
            db_session, org.id, "test-bank", ["lecture-01"]
        )

        assert not inv.is_complete
        assert not inv.is_servable
        assert inv.missing_keys == ["lecture-01"]
        assert inv.awaiting_transcode_keys == []

    def test_one_awaiting_transcode_of_two_blocks_the_module(
        self, db_session: Session
    ):
        """Every reference, not any: a half-ready module is not served."""
        org = _org(db_session, "Trust Partial")
        _upload(db_session, org.id, "lecture-01", "asset-1")
        _upload(
            db_session,
            org.id,
            "lecture-02",
            "asset-2",
            transcoded=False,
        )

        inv = get_media_inventory(
            db_session,
            org.id,
            "test-bank",
            ["lecture-01", "lecture-02"],
        )

        assert inv.is_complete
        assert not inv.is_servable
        assert inv.awaiting_transcode_keys == ["lecture-02"]


class TestModuleMediaIsComplete:
    """The learner gate: is every ``<Video ref>`` backed by a file?

    Separated from ``MediaInventory`` because the gate adds two things
    the inventory has no opinion about — that a module referencing no
    media is complete, and that the answer is asked per organisation.
    """

    def test_a_module_referencing_no_media_is_complete(
        self, db_session: Session, monkeypatch
    ):
        """Most modules. The gate must be invisible to them."""
        from app.features.teaching import media

        org = _org(db_session, "Trust No-Media")
        monkeypatch.setattr(
            media, "get_referenced_media_keys", lambda _module_id: []
        )

        assert media.module_media_is_complete(db_session, org.id, "test-bank")

    def test_a_reference_without_an_upload_makes_it_incomplete(
        self, db_session: Session, monkeypatch
    ):
        from app.features.teaching import media

        org = _org(db_session, "Trust Missing")
        monkeypatch.setattr(
            media,
            "get_referenced_media_keys",
            lambda _module_id: ["lecture-01"],
        )

        assert not media.module_media_is_complete(
            db_session, org.id, "test-bank"
        )

    def test_every_reference_uploaded_makes_it_complete(
        self, db_session: Session, monkeypatch
    ):
        from app.features.teaching import media

        org = _org(db_session, "Trust Complete")
        _upload(db_session, org.id, "lecture-01", "asset-1")
        _upload(db_session, org.id, "lecture-02", "asset-2")
        monkeypatch.setattr(
            media,
            "get_referenced_media_keys",
            lambda _module_id: ["lecture-01", "lecture-02"],
        )

        assert media.module_media_is_complete(db_session, org.id, "test-bank")

    def test_one_missing_of_two_is_incomplete(
        self, db_session: Session, monkeypatch
    ):
        """All references, not any: a half-filled module is not served."""
        from app.features.teaching import media

        org = _org(db_session, "Trust Half")
        _upload(db_session, org.id, "lecture-01", "asset-1")
        monkeypatch.setattr(
            media,
            "get_referenced_media_keys",
            lambda _module_id: ["lecture-01", "lecture-02"],
        )

        assert not media.module_media_is_complete(
            db_session, org.id, "test-bank"
        )

    def test_completeness_is_per_organisation(
        self, db_session: Session, monkeypatch
    ):
        """One trust's upload must not complete another's module.

        The same module runs in both, and the links are separate. This
        is what makes the same module visible to one organisation's
        learners and hidden from another's.
        """
        from app.features.teaching import media

        has = _org(db_session, "Trust With Upload")
        lacks = _org(db_session, "Trust Without")
        _upload(db_session, has.id, "lecture-01", "asset-1")
        monkeypatch.setattr(
            media,
            "get_referenced_media_keys",
            lambda _module_id: ["lecture-01"],
        )

        assert media.module_media_is_complete(db_session, has.id, "test-bank")
        assert not media.module_media_is_complete(
            db_session, lacks.id, "test-bank"
        )
