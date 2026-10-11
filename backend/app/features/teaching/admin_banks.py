"""What an administrator is shown of one question bank.

The detail page behind ``manage_teaching``: the newest version synced
into the administrator's organisation, the version it serves, how many
items it holds, and the emails it sends about a pass.

Which copy of the bank is theirs to see is not decided here.
``newest_copy_held_by`` in ``app.features.teaching.access`` answers
that. This module refuses where there is none, and builds the answer
from the one it is given. The administrator's two lists are in
``app.features.teaching.listing``.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching import email_templates
from app.features.teaching.access import newest_copy_held_by
from app.features.teaching.errors import BankNotHeldHere
from app.features.teaching.models import (
    QuestionBankItem,
    QuestionBankOrgStatus,
)
from app.features.teaching.schemas import AdminBankDetailOut, EmailTemplateOut


def admin_bank_detail(
    db: Session, org_unit_id: int, bank_id: str
) -> AdminBankDetailOut:
    """Describe one bank as the administrator's organisation holds it.

    Everything is read from that organisation's own rows: its newest
    synced copy, its items and its status row. Another organisation's
    copy of the same bank is not looked at.

    The items counted are those of every version the organisation
    holds, where the administrator's list counts the newest version's
    only, so the two can give different counts for one bank.

    The email templates are given only where the bank's configuration
    switches on an email about a pass, to the student or to the
    coordinator. With either switched on, both templates are looked
    for.

    Args:
        db: Core database session.
        org_unit_id: The organisation the caller administers.
        bank_id: The question bank.

    Returns:
        The detail. ``version`` is the newest synced; ``active_version``
        is the one served, and None where nothing is served yet.

    Raises:
        BankNotHeldHere: The organisation holds no synced copy of the
            bank, whether or not another organisation does.
    """
    copy_held = newest_copy_held_by(db, org_unit_id, bank_id)

    if not copy_held:
        raise BankNotHeldHere()

    # Item count
    item_ids = (
        db.execute(
            select(QuestionBankItem.id).where(
                QuestionBankItem.org_unit_id == org_unit_id,
                QuestionBankItem.question_bank_id == bank_id,
            )
        )
        .scalars()
        .all()
    )

    config = copy_held.config_yaml
    results = config.get("results", {})
    email_student_on_pass: bool = results.get("email_student_on_pass", False)
    email_coordinator_on_pass: bool = results.get(
        "email_coordinator_on_pass", False
    )

    # Load email templates if either email flag is enabled
    coordinator_template: EmailTemplateOut | None = None
    student_template: EmailTemplateOut | None = None

    if email_student_on_pass or email_coordinator_on_pass:
        coordinator_template = _template(config, "coordinator_email")
        student_template = _template(config, "student_email")

    # The pointer for this organisation, which may lag the newest import.
    status_row = (
        db.execute(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.org_unit_id == org_unit_id,
                QuestionBankOrgStatus.question_bank_id == bank_id,
            )
        )
        .scalars()
        .first()
    )

    return AdminBankDetailOut(
        bank_id=bank_id,
        title=copy_held.title,
        version=copy_held.version,
        active_version=status_row.active_version if status_row else None,
        type=copy_held.type,
        item_count=len(item_ids),
        email_student_on_pass=email_student_on_pass,
        email_coordinator_on_pass=email_coordinator_on_pass,
        coordinator_email_template=coordinator_template,
        student_email_template=student_template,
    )


def _template(
    config: dict[str, Any], template_name: str
) -> EmailTemplateOut | None:
    """One of a bank's email templates, as the page previews it.

    Returns:
        The template, or None where the configuration has no section by
        that name. A template that does not say whether to attach the
        certificate attaches it, and an empty preheader is given as
        None.
    """
    template = email_templates.extract_email_template(config, template_name)

    if not template:
        return None

    return EmailTemplateOut(
        subject=template["subject"],
        body=template["body"],
        attach_certificate=template.get("attach_certificate", True),
        preheader=template.get("preheader") or None,
    )
