"""Media keeps its address when the organisations table goes.

Media lives at ``{prefix}/{module}/{asset}`` in the bucket and the
signed cookie covers exactly that path, so every object of one module at
one place has to share a prefix. A second number for the same place
would need a second cookie, and nothing issues one.

That prefix has been the organisation's own id. The organisations table
is being dropped, so the number is recorded on the place instead —
``org_unit.media_prefix_id`` — and read from there. Nothing in the
bucket moves, and a place created afterwards files under its own id,
there being no second number for it to have.

These tests pin the two halves: what the prefix resolves to, and that a
media link written by naming a place lands on the same number.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from app.features.teaching.models import ModuleMediaLink
from app.models import Organisation, OrgUnit
from app.organisations import media_prefix_of


@pytest.fixture
def org(db_session: Session) -> Organisation:
    """An organisation whose id and place id differ.

    The spacer ward in ``conftest`` keeps the two sequences apart, which
    is what makes the fallback distinguishable from the recorded value.
    """
    organisation = Organisation(name="Trust", type="hospital")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    assert organisation.id != organisation.org_unit_id
    return organisation


def _record_the_existing_prefix(db: Session, org: Organisation) -> None:
    """What the migration does for an organisation already holding media."""
    place = db.get(OrgUnit, org.org_unit_id)
    assert place is not None
    place.media_prefix_id = org.id
    db.commit()


class TestWhatThePrefixResolvesTo:
    def test_a_recorded_prefix_is_used(
        self, db_session: Session, org: Organisation
    ) -> None:
        """The objects are under that number, so the answer must be it."""
        _record_the_existing_prefix(db_session, org)

        assert media_prefix_of(db_session, org.org_unit_id) == org.id

    def test_a_place_with_nothing_recorded_uses_its_own_id(
        self, db_session: Session
    ) -> None:
        """A place created since. There is no second number for it."""
        ward = OrgUnit(name="Ward 1", type="ward")
        db_session.add(ward)
        db_session.commit()

        assert media_prefix_of(db_session, ward.id) == ward.id

    def test_a_place_that_does_not_exist_has_no_prefix(
        self, db_session: Session
    ) -> None:
        """None rather than a number, so a caller cannot sign a cookie
        for a prefix nothing is filed under."""
        assert media_prefix_of(db_session, 999999) is None


class TestWhereALinkLands:
    def test_a_link_takes_the_recorded_prefix(
        self, db_session: Session, org: Organisation
    ) -> None:
        """Otherwise a new upload would point at a path with no file.

        The row carries the address because deleting the object later is
        the one operation that cannot re-derive it.
        """
        _record_the_existing_prefix(db_session, org)

        link = ModuleMediaLink(
            org_unit_id=org.org_unit_id,
            question_bank_id="test-bank",
            media_key="lecture-01",
            asset_id="asset-1",
            original_filename="asset-1.mp4",
            content_type="video/mp4",
            size_bytes=1024,
            uploaded_at=datetime.now(UTC),
        )
        db_session.add(link)
        db_session.commit()

        assert link.organisation_id == org.id

    def test_a_link_at_a_place_with_nothing_recorded_takes_its_id(
        self, db_session: Session, org: Organisation
    ) -> None:
        link = ModuleMediaLink(
            org_unit_id=org.org_unit_id,
            question_bank_id="test-bank",
            media_key="lecture-01",
            asset_id="asset-1",
            original_filename="asset-1.mp4",
            content_type="video/mp4",
            size_bytes=1024,
            uploaded_at=datetime.now(UTC),
        )
        db_session.add(link)
        db_session.commit()

        assert link.organisation_id == org.org_unit_id
