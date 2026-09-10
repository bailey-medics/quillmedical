"""Tests for retiring a competency rather than deleting it.

Deleting an id from ``shared/competency-definitions/`` revokes nothing:
``resolve_user_competencies`` does set operations on plain strings and
``has_competency`` compares a string from the route against that set. Neither
consults the catalogue. So the access carries on unchanged and only stops
being describable — and the audit trail loses the vocabulary it needs to say
what someone was authorised to do.

So a competency is retired, by giving its entry a ``retired_on`` date, and
never removed. Retired ids stay valid everywhere something is read, and are
refused everywhere something new is written. A CI check
(``.github/scripts/ci/check-competencies-not-deleted.sh``) stops the next
person deleting one and getting a green build.
"""

from __future__ import annotations

from datetime import date

import pytest
import yaml

from app.cbac import competencies as catalogue
from app.cbac.audit import (
    retired_ids_in_practising_competencies,
    retired_ids_on_users,
)
from app.cbac.competencies import (
    CompetencyEntry,
    retired_competency_ids,
    unknown_competency_ids,
    validate_competency_ids,
)
from app.models import Organisation, PractisingCompetency, User
from app.security import hash_password

REAL = "access_patient_records"
MADE_UP = "prescribe_moonbeams"


RETIRABLE = "certify_cremation"


def _retire(monkeypatch, competency_id: str = RETIRABLE) -> str:
    """Retire a real competency for the rest of one test.

    Nothing is retired in the shipped catalogue yet, so the behaviour has to
    be exercised against a stand-in rather than left untested until the day
    it matters. Called mid-test where the order matters: a row can only be
    written while its competency is still active, which is exactly how a
    real one comes to hold a retired id.
    """
    entries = [
        CompetencyEntry(
            id=c.id,
            display_name=c.display_name,
            retired_on=(date(2026, 9, 8) if c.id == competency_id else None),
        )
        for c in catalogue.COMPETENCIES
    ]
    monkeypatch.setattr(catalogue, "COMPETENCIES", entries)
    monkeypatch.setattr(
        catalogue, "COMPETENCY_IDS", tuple(c.id for c in entries)
    )
    monkeypatch.setattr(
        catalogue,
        "ACTIVE_COMPETENCY_IDS",
        tuple(c.id for c in entries if c.retired_on is None),
    )
    monkeypatch.setattr(
        catalogue,
        "RETIRED_COMPETENCY_IDS",
        tuple(c.id for c in entries if c.retired_on is not None),
    )
    return competency_id


@pytest.fixture
def with_a_retired_competency(monkeypatch):
    """A competency already retired before the test body runs."""
    return _retire(monkeypatch)


class TestTheShippedCatalogue:
    """What the file looks like today."""

    def test_nothing_is_retired_yet(self):
        """A guard on the fixture above: it stands in for a real case."""
        assert catalogue.RETIRED_COMPETENCY_IDS == ()

    def test_active_and_all_agree_while_nothing_is_retired(self):
        assert catalogue.ACTIVE_COMPETENCY_IDS == catalogue.COMPETENCY_IDS

    def test_retired_on_defaults_to_none(self):
        assert all(c.retired_on is None for c in catalogue.COMPETENCIES)


class TestTheYamlRoundTrip:
    """That `retired_on:` in the file becomes a date on the entry.

    The tests below build ``CompetencyEntry`` objects in Python, so they
    would pass even if the file could not be read back. That matters more
    than usual here: ``CompetencyEntry`` forbids extra keys and
    ``competencies.py`` is imported at start-up, so a mismatch between the
    field and the file would take the backend down the first time anyone
    retired anything — and every other test here would still be green.
    """

    def _load(self, text: str) -> list[CompetencyEntry]:
        return [
            CompetencyEntry(**entry)
            for entry in yaml.safe_load(text)["competencies"]
        ]

    def test_a_retired_on_line_is_read_as_a_date(self):
        entries = self._load("""
            competencies:
              - id: certify_death
                display_name: "Certify Death"
                retired_on: 2026-09-08
            """)
        assert entries[0].retired_on == date(2026, 9, 8)

    def test_a_quoted_date_is_read_too(self):
        """YAML gives a bare date a date type and a quoted one a string."""
        entries = self._load("""
            competencies:
              - id: certify_death
                display_name: "Certify Death"
                retired_on: "2026-09-08"
            """)
        assert entries[0].retired_on == date(2026, 9, 8)

    def test_an_entry_without_it_parses_as_current(self):
        entries = self._load("""
            competencies:
              - id: certify_death
                display_name: "Certify Death"
            """)
        assert entries[0].retired_on is None

    def test_a_misspelt_field_is_refused(self):
        """`extra="forbid"` is what makes a typo here loud rather than
        silently leaving the competency current."""
        with pytest.raises(ValueError):
            self._load("""
                competencies:
                  - id: certify_death
                    display_name: "Certify Death"
                    retired: 2026-09-08
                """)

    def test_a_date_that_is_not_one_is_refused(self):
        with pytest.raises(ValueError):
            self._load("""
                competencies:
                  - id: certify_death
                    display_name: "Certify Death"
                    retired_on: "soon"
                """)

    def test_the_shipped_catalogue_parses(self):
        """The real file, already read by importing the module."""
        assert catalogue.COMPETENCIES
        assert all(
            isinstance(c, CompetencyEntry) for c in catalogue.COMPETENCIES
        )


class TestARetiredCompetency:
    """Readable for ever, never granted again."""

    def test_it_stays_known(self, with_a_retired_competency):
        """Records that reference it must still resolve."""
        assert unknown_competency_ids([with_a_retired_competency]) == []

    def test_it_is_reported_as_retired(self, with_a_retired_competency):
        assert retired_competency_ids([with_a_retired_competency]) == [
            with_a_retired_competency
        ]

    def test_it_cannot_be_newly_granted(self, with_a_retired_competency):
        with pytest.raises(ValueError, match="Retired competency"):
            validate_competency_ids([with_a_retired_competency])

    def test_the_refusal_says_existing_records_keep_it(
        self, with_a_retired_competency
    ):
        """The message must not read as though access was revoked."""
        with pytest.raises(ValueError, match="existing"):
            validate_competency_ids([with_a_retired_competency])

    def test_a_retired_id_is_distinguished_from_a_typo(
        self, with_a_retired_competency
    ):
        """Two different problems, two different messages."""
        with pytest.raises(ValueError, match="Unknown competency"):
            validate_competency_ids([MADE_UP])

    def test_active_competencies_are_unaffected(
        self, with_a_retired_competency
    ):
        assert validate_competency_ids([REAL]) == [REAL]

    def test_it_drops_out_of_the_active_list(self, with_a_retired_competency):
        assert with_a_retired_competency not in (
            catalogue.ACTIVE_COMPETENCY_IDS
        )
        assert with_a_retired_competency in catalogue.COMPETENCY_IDS


class TestTheCleanupQueue:
    """Retiring a competency does not revoke anyone's access.

    It stops new ones being granted. Whether existing practice should end
    too is a separate decision, so the audit lists the rows rather than
    removing them.
    """

    def _user(self, db, username: str) -> User:
        user = User(
            username=username,
            email=f"{username}@example.test",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
            base_profession="consultant",
            system_permissions="staff",
        )
        db.add(user)
        db.commit()
        return user

    def test_a_practising_row_holding_a_retired_competency_is_listed(
        self, db_session, monkeypatch
    ):
        """Written while active, retired afterwards — the real sequence.

        It cannot be written the other way round: the model refuses a
        retired competency, which is the point of the guard.
        """
        org = Organisation(name="Trust", type="hospital")
        db_session.add(org)
        db_session.commit()
        person = self._user(db_session, "long_server")
        row = PractisingCompetency(
            user_id=person.id,
            organisation_id=org.id,
            competency=RETIRABLE,
        )
        db_session.add(row)
        db_session.commit()

        retired = _retire(monkeypatch)

        assert retired_ids_in_practising_competencies(db_session) == {
            row.id: retired
        }

    def test_a_user_holding_a_retired_competency_is_listed(
        self, db_session, monkeypatch
    ):
        person = self._user(db_session, "long_server")
        person.additional_competencies = [REAL, RETIRABLE]
        db_session.commit()

        retired = _retire(monkeypatch)

        assert retired_ids_on_users(db_session) == {person.id: [retired]}

    def test_nothing_is_listed_when_nothing_is_retired(self, db_session):
        person = self._user(db_session, "current_staff")
        person.additional_competencies = [REAL]
        db_session.commit()

        assert retired_ids_on_users(db_session) == {}
