"""What a caller may hand out to other people.

``manage_users`` may grant anything. ``manage_teaching`` may grant and
remove only the teaching competencies, and give only the teaching
professions, and may act on an account as a whole only when the person's
profession is a teaching one. See
``docs/docs/plans/2026-09-30-manage-teaching-competency-plan.md``.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.cbac.competencies import (
    COMPETENCIES,
    SCOPED_MANAGER_IDS,
    _load_competencies,
)
from app.cbac.grant_scope import (
    UNLIMITED,
    may_assign_profession,
    may_grant,
    may_manage_account,
    out_of_scope_competencies,
    scope_for_competencies,
)
from app.cbac.grants import sync_competency_rows
from app.models import User
from app.security import hash_password

TEACHING_COMPETENCIES = frozenset(
    {"view_teaching_cases", "manage_teaching", "view_teaching_analytics"}
)
TEACHING_PROFESSIONS = frozenset(
    {"teaching_delegate", "teaching_clinical_lead", "teaching_admin"}
)


def _user(db: Session, username: str, profession: str) -> User:
    user = User(
        username=username,
        email=f"{username}@test.local",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class TestScopeForCompetencies:
    def test_the_root_competency_has_no_limit(self) -> None:
        assert scope_for_competencies(["manage_users"]) == UNLIMITED
        assert UNLIMITED.unlimited

    def test_manage_teaching_gives_the_teaching_whitelists(self) -> None:
        scope = scope_for_competencies(["manage_teaching"])

        assert scope.competencies == TEACHING_COMPETENCIES
        assert scope.professions == TEACHING_PROFESSIONS

    def test_a_competency_with_no_lists_gives_nothing(self) -> None:
        scope = scope_for_competencies(["view_teaching_cases"])

        assert scope.competencies == frozenset()
        assert scope.professions == frozenset()

    def test_the_root_wins_over_a_narrower_list(self) -> None:
        held = ["manage_teaching", "manage_users"]

        assert scope_for_competencies(held) == UNLIMITED


def _coordinator(db: Session) -> User:
    """A teaching delegate given ``manage_teaching`` on top."""
    user = _user(db, "coordinator", "teaching_delegate")
    sync_competency_rows(
        user, additional=["manage_teaching"], removed=[], source="admin"
    )
    db.commit()
    db.refresh(user)
    assert "manage_teaching" in user.get_final_competencies()
    return user


class TestAgainstUsers:
    def test_a_teaching_holder_grants_only_teaching_competencies(
        self, db_session: Session
    ) -> None:
        caller = _coordinator(db_session)

        assert may_grant(caller, "view_teaching_cases")
        assert not may_grant(caller, "prescribe_controlled_schedule_2")
        assert not may_grant(caller, "manage_users")
        assert out_of_scope_competencies(
            caller, ["view_teaching_cases", "manage_users", "manage_users"]
        ) == ["manage_users"]

    def test_a_teaching_holder_gives_only_teaching_professions(
        self, db_session: Session
    ) -> None:
        caller = _coordinator(db_session)

        assert may_assign_profession(caller, "teaching_delegate")
        assert not may_assign_profession(caller, "consultant")

    def test_a_clinician_account_is_out_of_a_teaching_holders_reach(
        self, db_session: Session
    ) -> None:
        caller = _coordinator(db_session)
        delegate = _user(db_session, "delegate", "teaching_delegate")
        consultant = _user(db_session, "consultant", "consultant")

        assert may_manage_account(caller, delegate)
        assert not may_manage_account(caller, consultant)

    def test_a_user_manager_reaches_every_account(
        self, db_session: Session
    ) -> None:
        caller = _user(db_session, "admin", "superadmin_profession")
        consultant = _user(db_session, "consultant", "consultant")

        assert "manage_users" in caller.get_final_competencies()
        assert may_grant(caller, "prescribe_controlled_schedule_2")
        assert may_manage_account(caller, consultant)
        assert out_of_scope_competencies(caller, ["anything"]) == []


class TestScopedManagers:
    """Which competencies open the people routes within a whitelist.

    Read from the catalogue rather than named in each route, so a new
    scoped manager is one YAML entry. Pinned because a competency that
    gained a whitelist by mistake would open the people routes to its
    holders, and one that lost it would lock them out, both silently.
    """

    def test_manage_teaching_is_a_scoped_manager(self) -> None:
        assert "manage_teaching" in SCOPED_MANAGER_IDS

    def test_the_root_competency_is_not(self) -> None:
        """``manage_users`` opens the routes on its own, without a list."""
        assert "manage_users" not in SCOPED_MANAGER_IDS

    def test_every_one_has_a_whitelist_and_is_current(self) -> None:
        by_id = {entry.id: entry for entry in COMPETENCIES}
        for competency_id in SCOPED_MANAGER_IDS:
            entry = by_id[competency_id]
            assert entry.retired_on is None
            assert entry.may_grant or entry.may_assign_professions

    def test_every_competency_with_a_whitelist_is_one(self) -> None:
        listed = {
            entry.id
            for entry in COMPETENCIES
            if entry.retired_on is None
            and (entry.may_grant or entry.may_assign_professions)
        }
        assert listed == set(SCOPED_MANAGER_IDS)


class TestLoadChecks:
    def _write(self, tmp_path: Path, may_grant_ids: list[str]) -> None:
        listed = "".join(f"\n      - {i}" for i in may_grant_ids)
        (tmp_path / "a.yaml").write_text(
            "competencies:\n"
            "  - id: granter\n"
            '    display_name: "Granter"\n'
            f"    may_grant:{listed}\n"
            "  - id: manage_users\n"
            '    display_name: "Root"\n'
            "  - id: passport_write\n"
            '    display_name: "Sold"\n'
            "  - id: old\n"
            '    display_name: "Old"\n'
            "    retired_on: 2026-01-01\n"
        )

    def test_an_unknown_id_fails_to_load(self, tmp_path: Path) -> None:
        self._write(tmp_path, ["misspelt"])

        with pytest.raises(ValueError, match="unknown competency"):
            _load_competencies(tmp_path)

    def test_a_retired_id_fails_to_load(self, tmp_path: Path) -> None:
        self._write(tmp_path, ["old"])

        with pytest.raises(ValueError, match="retired competency"):
            _load_competencies(tmp_path)

    def test_the_root_competency_fails_to_load(self, tmp_path: Path) -> None:
        self._write(tmp_path, ["manage_users"])

        with pytest.raises(ValueError, match="may only be granted"):
            _load_competencies(tmp_path)

    def test_the_sold_competency_fails_to_load(self, tmp_path: Path) -> None:
        """Only ``manage_passport`` may hand out ``passport_write``.

        It is what an organisation or a person pays for, so any other
        whitelist naming it would give the passport away with nothing
        visibly wrong.
        """
        self._write(tmp_path, ["passport_write"])

        with pytest.raises(ValueError, match="sold rather than granted"):
            _load_competencies(tmp_path)

    def test_manage_passport_may_name_it(self, tmp_path: Path) -> None:
        (tmp_path / "a.yaml").write_text(
            "competencies:\n"
            "  - id: manage_passport\n"
            '    display_name: "Passport admin"\n'
            "    may_grant:\n"
            "      - passport_write\n"
            "  - id: passport_write\n"
            '    display_name: "Sold"\n'
        )

        loaded = _load_competencies(tmp_path)

        assert {entry.id for entry in loaded} == {
            "manage_passport",
            "passport_write",
        }


class TestTheSoldCompetency:
    def test_only_manage_passport_names_it(self) -> None:
        naming = {
            entry.id
            for entry in COMPETENCIES
            if "passport_write" in (entry.may_grant or [])
        }
        assert naming == {"manage_passport"}

    def test_manage_teaching_cannot_grant_it(self) -> None:
        scope = scope_for_competencies(["manage_teaching"])

        assert scope.competencies is not None
        assert "passport_write" not in scope.competencies


class TestManagePassport:
    def test_is_a_scoped_manager(self) -> None:
        assert "manage_passport" in SCOPED_MANAGER_IDS

    def test_gives_the_passport_whitelists(self) -> None:
        scope = scope_for_competencies(["manage_passport"])

        assert scope.competencies == frozenset(
            {"assess_clinician_passport", "manage_passport", "passport_write"}
        )
        assert scope.professions == frozenset(
            {
                "passport_delegate",
                "passport_clinical_lead",
                "passport_admin",
                "passport_external_assessor",
            }
        )

    def test_holding_both_managers_unions_the_lists(self) -> None:
        scope = scope_for_competencies(["manage_passport", "manage_teaching"])

        assert scope.professions is not None
        assert "teaching_delegate" in scope.professions
        assert "passport_delegate" in scope.professions


class TestTheMeResponse:
    """``/api/auth/me`` carries the scope, so pickers need not work it out."""

    def test_a_teaching_admin_gets_the_whitelists(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        _user(db_session, "coordinator", "teaching_admin")
        test_client.post(
            "/api/auth/login",
            json={"username": "coordinator", "password": "Password123!"},
        )

        body = test_client.get("/api/auth/me").json()

        assert body["may_grant"] == sorted(TEACHING_COMPETENCIES)
        assert body["may_assign_professions"] == sorted(TEACHING_PROFESSIONS)

    def test_a_user_manager_has_no_limit(
        self, authenticated_admin_client: TestClient
    ) -> None:
        body = authenticated_admin_client.get("/api/auth/me").json()

        assert body["may_grant"] is None
        assert body["may_assign_professions"] is None

    def test_somebody_who_grants_nothing_gets_empty_lists(
        self, authenticated_client: TestClient
    ) -> None:
        body = authenticated_client.get("/api/auth/me").json()

        assert body["may_grant"] == []
        assert body["may_assign_professions"] == []
