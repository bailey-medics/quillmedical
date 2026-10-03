"""The modules the registration page offers.

``GET /api/teaching/public/modules`` lists the question banks somebody
may register for. Every version of a bank ever synced is kept, and each
organisation holds its own copy, so a bank has many rows to choose a
name from. It is named by its newest version: the one everybody is
served.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import OrgUnit

URL = "/api/teaching/public/modules"


def _org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()
    return org


def _version(
    db: Session, org: OrgUnit, bank_id: str, version: int, title: str
) -> None:
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            version=version,
            title=title,
            description="A question bank.",
            type="uniform",
            config_yaml={"version": version, "title": title},
        )
    )
    db.flush()


def _open(
    db: Session, org: OrgUnit, bank_id: str, *, registration: bool = True
) -> None:
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            is_live=True,
            site_registration=registration,
        )
    )
    db.commit()


def _modules(client: TestClient) -> list[dict[str, Any]]:
    resp = client.get(URL)
    assert resp.status_code == 200, resp.text
    modules: list[dict[str, Any]] = resp.json()["modules"]
    return modules


class TestWhatAModuleIsCalled:
    def test_a_module_is_named_by_its_newest_version(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """A later version renamed it; the earlier title sorts first.

        The route used to sort every version by title and keep the first
        row for each bank, so the title earliest in the alphabet won. A
        test module retitled "… Test" went on showing its old name, the
        same as the module it had been renamed apart from.
        """
        org = _org(db_session, "Teaching Trust")
        _version(db_session, org, "polyps-test", 5, "Optical Diagnosis")
        _version(db_session, org, "polyps-test", 6, "Optical Diagnosis Test")
        _open(db_session, org, "polyps-test")

        assert _modules(test_client) == [
            {"value": "polyps-test", "label": "Optical Diagnosis Test"}
        ]

    def test_two_modules_once_alike_are_told_apart(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        org = _org(db_session, "Teaching Trust")
        _version(db_session, org, "polyps", 6, "Optical Diagnosis")
        _version(db_session, org, "polyps-test", 5, "Optical Diagnosis")
        _version(db_session, org, "polyps-test", 6, "Optical Diagnosis Test")
        _open(db_session, org, "polyps")
        _open(db_session, org, "polyps-test")

        labels = [module["label"] for module in _modules(test_client)]

        assert labels == ["Optical Diagnosis", "Optical Diagnosis Test"]

    def test_a_module_held_by_two_organisations_is_listed_once(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        first = _org(db_session, "First Trust")
        second = _org(db_session, "Second Trust")
        for org in (first, second):
            _version(db_session, org, "chest-xray", 3, "Chest X-ray Old")
            _version(db_session, org, "chest-xray", 4, "Chest X-ray")
            _open(db_session, org, "chest-xray")

        assert _modules(test_client) == [
            {"value": "chest-xray", "label": "Chest X-ray"}
        ]


class TestWhatIsListed:
    def test_modules_are_listed_by_name(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        org = _org(db_session, "Teaching Trust")
        _version(db_session, org, "b-bank", 9, "Bronchoscopy")
        _version(db_session, org, "a-bank", 1, "Colonoscopy")
        _version(db_session, org, "c-bank", 4, "Arthroscopy")
        for bank in ("a-bank", "b-bank", "c-bank"):
            _open(db_session, org, bank)

        labels = [module["label"] for module in _modules(test_client)]

        assert labels == ["Arthroscopy", "Bronchoscopy", "Colonoscopy"]

    def test_a_module_not_open_for_registration_is_left_out(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        org = _org(db_session, "Teaching Trust")
        _version(db_session, org, "closed", 1, "Closed Module")
        _open(db_session, org, "closed", registration=False)

        assert _modules(test_client) == []

    def test_nothing_registrable_is_an_empty_list(
        self, test_client: TestClient
    ) -> None:
        assert _modules(test_client) == []
