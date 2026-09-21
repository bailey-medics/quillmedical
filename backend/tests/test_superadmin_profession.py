"""A superadmin holds `manage_users` through a profession, not a rank.

The admin route gates are moving from `system_permissions in ("admin",
"superadmin")` to the `manage_users` competency. `has_competency` has no
rank bypass — it reads the competency list and nothing else — so a
superadmin who holds no competencies would be refused by every gate the
swap touches. That is the one role meant to reach everything.

`superadmin_profession` is the answer: operating Quill grants its
competencies through the same mechanism as every other role. The
alternative, a rank check inside each gate, would leave a rung in the
ladder `2026-09-09-platform-role-plan.md` exists to remove.

**It carries no clinical competency.** A superadmin who needs to read a
patient record is granted that like anyone else — see "A superadmin is
not a clinician" in the plan.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.cbac.base_professions import (
    get_profession_base_competencies,
    resolve_user_competencies,
)
from app.models import User
from app.security import hash_password


class TestTheProfessionGrantsWhatTheGatesWillAskFor:
    """Without this, the swap refuses superadmins everywhere."""

    def test_it_grants_manage_users(self):
        assert "manage_users" in get_profession_base_competencies(
            "superadmin_profession"
        )

    def test_a_superadmin_resolves_to_holding_it(self):
        assert "manage_users" in resolve_user_competencies(
            base_profession="superadmin_profession"
        )


class TestItIsDeliberatelyNarrow:
    """Operating Quill is not practising medicine."""

    def test_it_grants_no_clinical_access(self):
        """The plan says a superadmin is not a clinician; this holds it.

        Adding a clinical competency here would give every operator
        access to patient records by virtue of being an operator, which
        is the coupling the platform role work exists to break.
        """
        granted = get_profession_base_competencies("superadmin_profession")

        assert "access_patient_records" not in granted

    def test_it_grants_only_administrative_competencies(self):
        """Three now, all administrative, so the blast radius stays visible.

        `manage_staff_membership` was split out of `manage_users` — who
        belongs to a place, as opposed to who has an account at all — and
        granted alongside it to every profession that held it, superadmin
        included. Without it an operator could not add staff to an
        organisation, and `has_competency` has no rank bypass to fall
        back on, which is the refusal this profession exists to prevent.

        `manage_practising_competencies` follows the same pattern: who may
        practise what at a place, as opposed to what they are qualified
        for anywhere. It went to the four professions already holding
        `manage_staff_membership`, superadmin among them, so the routes
        authorising practice are reachable by somebody on the day they
        ship.

        The narrowness this class defends is *clinical*. That line is
        held by the test above, not by this one; this is a snapshot, so
        that a competency gained here has to be stated deliberately
        rather than noticed later.
        """
        assert get_profession_base_competencies("superadmin_profession") == [
            "manage_users",
            "manage_staff_membership",
            "manage_practising_competencies",
        ]


class TestProvisioningGrantsTheOperatorCompetencies:
    """A superadmin must hold what the gates will ask for.

    Note the column default: `base_profession` is NOT NULL defaulting to
    `patient`, so a superadmin provisioned without one is not competency
    free — they are a *patient*, holding `access_patient_records` and not
    `manage_users`. Both too much and too little, which is why fresh
    superadmins get `superadmin_profession` and promoted ones get its
    competencies added.
    """

    def test_promotion_grants_the_operator_competencies(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ):
        """`PATCH /users/{id}` adds them when promoting to superadmin."""
        target = User(
            username="testuser2",
            email="testuser2@example.test",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
        )
        db_session.add(target)
        db_session.commit()
        db_session.refresh(target)

        csrf = authenticated_superadmin_client.cookies.get("XSRF-TOKEN", "")
        resp = authenticated_superadmin_client.patch(
            f"/api/users/{target.id}",
            json={"platform_role": "superadmin"},
            headers={"X-CSRF-Token": csrf},
        )

        assert resp.status_code == 200
        db_session.refresh(target)
        assert "manage_users" in target.get_final_competencies()

    def test_promotion_does_not_overwrite_an_existing_profession(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
    ):
        """A clinician promoted to superadmin keeps their profession.

        The operator competencies are added alongside it rather than
        replacing it. Overwriting would silently strip a consultant of
        their clinical competencies the moment someone made them an
        operator.
        """
        target = User(
            username="testclinician",
            email="clinician@example.test",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
            base_profession="consultant",
        )
        db_session.add(target)
        db_session.commit()
        db_session.refresh(target)

        csrf = authenticated_superadmin_client.cookies.get("XSRF-TOKEN", "")
        resp = authenticated_superadmin_client.patch(
            f"/api/users/{target.id}",
            json={"platform_role": "superadmin"},
            headers={"X-CSRF-Token": csrf},
        )

        assert resp.status_code == 200
        db_session.refresh(target)
        assert target.base_profession == "consultant"
        # Both sets, not one replacing the other.
        final = target.get_final_competencies()
        assert "manage_users" in final
        assert "access_patient_records" in final
