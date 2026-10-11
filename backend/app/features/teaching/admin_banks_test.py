"""What an administrator is shown of one bank, asked of admin_banks.py."""

from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.features.teaching.admin_banks import admin_bank_detail
from app.features.teaching.errors import BankNotHeldHere
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankOrgStatus,
)
from app.features.teaching.schemas import AdminBankDetailOut, EmailTemplateOut
from app.models import OrgUnit

BANK = "polyps"
OTHER_BANK = "bleeding"

STUDENT_EMAIL = {
    "subject": "Your certificate",
    "body": "Well done.",
    "attach_certificate": True,
    "preheader": "You passed",
}
COORDINATOR_EMAIL = {
    "subject": "Certificate issued",
    "body": "Somebody passed.",
    "attach_certificate": False,
}


def _organisation(db: Session, name: str = "Trust") -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()

    return org


def _synced(
    db: Session,
    org: OrgUnit,
    bank_id: str = BANK,
    *,
    version: int = 1,
    title: str = "Polyps",
    config: dict[str, Any] | None = None,
) -> None:
    """One version of a bank, synced into the organisation."""
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            version=version,
            title=title,
            description="A question bank.",
            type="uniform",
            config_yaml=config or {},
        )
    )
    db.flush()


def _items(
    db: Session,
    org: OrgUnit,
    count: int,
    *,
    bank_id: str = BANK,
    version: int = 1,
) -> None:
    for _ in range(count):
        db.add(
            QuestionBankItem(
                org_unit_id=org.id,
                question_bank_id=bank_id,
                bank_version=version,
                status="published",
            )
        )

    db.flush()


def _served(
    db: Session,
    org: OrgUnit,
    bank_id: str = BANK,
    *,
    active_version: int | None = 1,
) -> None:
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            is_live=True,
            active_version=active_version,
        )
    )
    db.flush()


def _emails(
    *, student: bool = False, coordinator: bool = False, **sections: Any
) -> dict[str, Any]:
    """A bank's configuration, with its emails about a pass on or off."""
    return {
        "results": {
            "email_student_on_pass": student,
            "email_coordinator_on_pass": coordinator,
        },
        **sections,
    }


# --- which bank -------------------------------------------------------------


def test_a_bank_nobody_holds_is_refused(db_session: Session) -> None:
    org = _organisation(db_session)

    with pytest.raises(BankNotHeldHere) as refused:
        admin_bank_detail(db_session, org.id, BANK)

    assert refused.value.status_code == 404
    assert refused.value.message == "Question bank not found"


def test_a_bank_only_another_organisation_holds_is_refused_the_same_way(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    other = _organisation(db_session, "Another Trust")
    _synced(db_session, other)
    _served(db_session, other)

    with pytest.raises(BankNotHeldHere) as refused:
        admin_bank_detail(db_session, org.id, BANK)

    assert refused.value.message == "Question bank not found"


def test_a_bank_is_described_by_its_newest_synced_version(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org, version=1, title="Polyps, first")
    _synced(db_session, org, version=2, title="Polyps, second")
    _served(db_session, org, active_version=1)

    assert admin_bank_detail(db_session, org.id, BANK) == AdminBankDetailOut(
        bank_id=BANK,
        title="Polyps, second",
        version=2,
        active_version=1,
        type="uniform",
        item_count=0,
        email_student_on_pass=False,
        email_coordinator_on_pass=False,
        coordinator_email_template=None,
        student_email_template=None,
    )


def test_a_bank_nothing_is_served_of_has_no_active_version(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org)

    assert admin_bank_detail(db_session, org.id, BANK).active_version is None


def test_another_organisations_copy_and_served_version_are_not_read(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    other = _organisation(db_session, "Another Trust")
    _synced(db_session, org, version=1)
    _synced(db_session, other, version=9, title="Their polyps")
    _served(db_session, other, active_version=9)

    detail = admin_bank_detail(db_session, org.id, BANK)

    assert (detail.title, detail.version) == ("Polyps", 1)
    assert detail.active_version is None


# --- its items --------------------------------------------------------------


def test_the_items_of_every_version_held_are_counted(
    db_session: Session,
) -> None:
    """As the route had it: every version's, where the list of banks
    counts the newest version's only.
    """
    org = _organisation(db_session)
    _synced(db_session, org, version=1)
    _synced(db_session, org, version=2)
    _items(db_session, org, 3, version=1)
    _items(db_session, org, 2, version=2)

    assert admin_bank_detail(db_session, org.id, BANK).item_count == 5


def test_items_of_another_bank_or_organisation_are_not_counted(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    other = _organisation(db_session, "Another Trust")
    _synced(db_session, org)
    _items(db_session, org, 1)
    _items(db_session, org, 4, bank_id=OTHER_BANK)
    _items(db_session, other, 6)

    assert admin_bank_detail(db_session, org.id, BANK).item_count == 1


# --- its emails about a pass ------------------------------------------------


def test_with_neither_email_switched_on_no_template_is_given(
    db_session: Session,
) -> None:
    """The templates are in the configuration and are not looked for."""
    org = _organisation(db_session)
    _synced(
        db_session,
        org,
        config=_emails(
            student_email=STUDENT_EMAIL,
            coordinator_email=COORDINATOR_EMAIL,
        ),
    )

    detail = admin_bank_detail(db_session, org.id, BANK)

    assert detail.email_student_on_pass is False
    assert detail.email_coordinator_on_pass is False
    assert detail.student_email_template is None
    assert detail.coordinator_email_template is None


def test_with_both_emails_switched_on_both_templates_are_given(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _synced(
        db_session,
        org,
        config=_emails(
            student=True,
            coordinator=True,
            student_email=STUDENT_EMAIL,
            coordinator_email=COORDINATOR_EMAIL,
        ),
    )

    detail = admin_bank_detail(db_session, org.id, BANK)

    assert detail.email_student_on_pass is True
    assert detail.email_coordinator_on_pass is True
    assert detail.student_email_template == EmailTemplateOut(
        subject="Your certificate",
        body="Well done.",
        attach_certificate=True,
        preheader="You passed",
    )
    assert detail.coordinator_email_template == EmailTemplateOut(
        subject="Certificate issued",
        body="Somebody passed.",
        attach_certificate=False,
        preheader=None,
    )


@pytest.mark.parametrize(
    ("student", "coordinator"), [(True, False), (False, True)]
)
def test_with_either_email_switched_on_both_templates_are_looked_for(
    db_session: Session, student: bool, coordinator: bool
) -> None:
    """One switch gives both templates, the one not switched on too."""
    org = _organisation(db_session)
    _synced(
        db_session,
        org,
        config=_emails(
            student=student,
            coordinator=coordinator,
            student_email=STUDENT_EMAIL,
            coordinator_email=COORDINATOR_EMAIL,
        ),
    )

    detail = admin_bank_detail(db_session, org.id, BANK)

    assert detail.email_student_on_pass is student
    assert detail.email_coordinator_on_pass is coordinator
    assert detail.student_email_template is not None
    assert detail.coordinator_email_template is not None


def test_an_email_switched_on_with_no_template_written_gives_none(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org, config=_emails(student=True, coordinator=True))

    detail = admin_bank_detail(db_session, org.id, BANK)

    assert detail.email_student_on_pass is True
    assert detail.student_email_template is None
    assert detail.coordinator_email_template is None


def test_a_template_that_does_not_say_attaches_the_certificate(
    db_session: Session,
) -> None:
    """And one whose preheader is blank is given none."""
    org = _organisation(db_session)
    _synced(
        db_session,
        org,
        config=_emails(
            student=True,
            student_email={
                "subject": "Your certificate",
                "body": "Well done.",
                "preheader": "   ",
            },
        ),
    )

    template = admin_bank_detail(
        db_session, org.id, BANK
    ).student_email_template

    assert template == EmailTemplateOut(
        subject="Your certificate",
        body="Well done.",
        attach_certificate=True,
        preheader=None,
    )


def test_a_bank_whose_configuration_says_nothing_of_results_sends_no_email(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org, config={"student_email": STUDENT_EMAIL})

    detail = admin_bank_detail(db_session, org.id, BANK)

    assert detail.email_student_on_pass is False
    assert detail.email_coordinator_on_pass is False
    assert detail.student_email_template is None
