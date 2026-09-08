"""Tests for catching a competency id that is not in the catalogue.

A competency id is a bare string in three unconnected places — the catalogue
in ``shared/competencies.yaml``, the two JSON columns on ``users``, and
``practising_competency`` — with no foreign key between any of them. Nothing
used to report a misspelt one: it was stored happily and surfaced much later
as a permission that never applied.

Two directions are covered. Write-boundary validation refuses a bad id where
it enters. The audit walks what is already stored, which is the case
validation cannot see: an id that was valid when written and stopped being
so when the catalogue changed.
"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.cbac.audit import (
    unknown_ids_in_base_professions,
    unknown_ids_in_practising_competencies,
    unknown_ids_on_users,
)
from app.cbac.competencies import (
    unknown_competency_ids,
    validate_competency_ids,
)
from app.models import Organisation, PractisingCompetency, User
from app.security import hash_password

REAL = "access_patient_records"
MADE_UP = "prescribe_moonbeams"


def _user(db: Session, username: str) -> User:
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


class TestTheCatalogueCheck:
    """The single check every write boundary uses."""

    def test_a_real_id_passes_through_unchanged(self):
        assert validate_competency_ids([REAL]) == [REAL]

    def test_an_unknown_id_is_named_in_the_error(self):
        with pytest.raises(ValueError, match=MADE_UP):
            validate_competency_ids([REAL, MADE_UP])

    def test_the_error_points_at_the_catalogue(self):
        """A caller seeing this should know where to look."""
        with pytest.raises(ValueError, match="shared/competencies.yaml"):
            validate_competency_ids([MADE_UP])

    def test_unknown_ids_are_deduplicated_and_sorted(self):
        assert unknown_competency_ids([MADE_UP, "aardvark", MADE_UP]) == [
            "aardvark",
            MADE_UP,
        ]

    def test_an_empty_list_is_fine(self):
        assert validate_competency_ids([]) == []


class TestTheAdminApiRefusesBadIds:
    """The boundary an administrator actually goes through."""

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "name": "Test Person",
            "username": "new_person",
            "email": "new.person@example.test",
            "password": "Password123!",
            "base_profession": "consultant",
        }
        payload.update(overrides)
        return payload

    def test_creating_a_user_with_an_unknown_competency_is_refused(
        self, authenticated_superadmin_client
    ):
        resp = authenticated_superadmin_client.post(
            "/api/users",
            json=self._payload(additional_competencies=[MADE_UP]),
        )
        assert resp.status_code == 422
        assert MADE_UP in resp.text

    def test_a_removed_competency_is_checked_too(
        self, authenticated_superadmin_client
    ):
        """A stale id here silently removes nothing, which is worse."""
        resp = authenticated_superadmin_client.post(
            "/api/users",
            json=self._payload(removed_competencies=[MADE_UP]),
        )
        assert resp.status_code == 422

    def test_an_unknown_base_profession_is_refused(
        self, authenticated_superadmin_client
    ):
        """The same silent failure: an unknown profession yields no
        competencies at all and says nothing."""
        resp = authenticated_superadmin_client.post(
            "/api/users",
            json=self._payload(base_profession="astronaut"),
        )
        assert resp.status_code == 422

    def test_real_competencies_are_accepted(
        self, authenticated_superadmin_client
    ):
        """The guard must not reject valid input."""
        resp = authenticated_superadmin_client.post(
            "/api/users",
            json=self._payload(additional_competencies=[REAL]),
        )
        assert resp.status_code in (200, 201)


class TestThePractisingRowRefusesBadIds:
    """Guarded on the attribute, so every write path is covered."""

    def test_an_unknown_competency_cannot_be_stored(self, db_session):
        org = Organisation(name="Trust", type="hospital")
        db_session.add(org)
        db_session.commit()
        person = _user(db_session, "practitioner")

        with pytest.raises(ValueError, match=MADE_UP):
            PractisingCompetency(
                user_id=person.id,
                organisation_id=org.id,
                competency=MADE_UP,
            )

    def test_a_real_competency_is_stored(self, db_session):
        org = Organisation(name="Trust", type="hospital")
        db_session.add(org)
        db_session.commit()
        person = _user(db_session, "practitioner")

        db_session.add(
            PractisingCompetency(
                user_id=person.id,
                organisation_id=org.id,
                competency=REAL,
            )
        )
        db_session.commit()
        assert unknown_ids_in_practising_competencies(db_session) == {}


class TestTheAuditWalksWhatIsStored:
    """The case validation cannot see: an id that went stale."""

    def test_the_two_shipped_catalogues_agree(self):
        """Every base profession names competencies that exist.

        Static drift between two checked-in files, so this fails in CI the
        moment one is edited without the other.
        """
        assert unknown_ids_in_base_professions() == {}

    def test_a_stale_id_on_a_user_is_reported(self, db_session):
        """Written before the catalogue changed, so no write check saw it."""
        person = _user(db_session, "veteran")
        # Set past the validator, as a catalogue removal would leave it.
        person.additional_competencies = [REAL, MADE_UP]
        db_session.commit()

        assert unknown_ids_on_users(db_session) == {person.id: [MADE_UP]}

    def test_a_stale_id_in_removed_competencies_is_reported(self, db_session):
        person = _user(db_session, "veteran")
        person.removed_competencies = [MADE_UP]
        db_session.commit()

        assert unknown_ids_on_users(db_session) == {person.id: [MADE_UP]}

    def test_clean_data_reports_nothing(self, db_session):
        person = _user(db_session, "veteran")
        person.additional_competencies = [REAL]
        db_session.commit()

        assert unknown_ids_on_users(db_session) == {}
