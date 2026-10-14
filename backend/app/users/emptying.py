"""Emptying a closed account: what its owner held goes, the row stays.

Section 3.1 of the privacy policy says that once an account's period has
passed we "delete it or remove everything that identifies you". This is
that. Everything the person owned is deleted, everything on the
``users`` row that said who they were is wiped, and the row itself is
kept as an id and two dates.

**Why the row is kept.** Other people's records point at it: a sign-off
this person gave on a colleague's passport, a message they sent, a
competency they granted. Removing the row would mean removing or
rewriting those, which are not this person's to take away. Kept and
blank, each of them goes on pointing at something, and the app shows
"Deleted account".

**What stays about them, on other people's records.** A sign-off keeps
the name it was given with: the passport holds its own copy, written at
the moment of signing, and it is part of that clinician's record. A
message stays, with no name. Their entry on the newsletter list stays,
because closing an account moved it there to outlive the account.

**Nothing here decides.** A superadmin marks an account to be emptied
on the record retention screen, and the nightly run calls this. It
refuses an account that is open, that still has training records, or
that is already empty.

**Every table is deleted by name**, the furthest from the account
first, as ``app.retention.delete_training_records`` does: the test
database enforces no foreign keys, and a delete that leant on a cascade
would be untested.
"""

from __future__ import annotations

import secrets
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import delete, exists, select, update
from sqlalchemy.orm import Session

from app.features.passport.models import (
    Passport,
    PassportAssessorInvite,
    PassportLogbookConfirmationRequest,
    PassportSignOffRequest,
)
from app.features.teaching.models import Assessment, ModuleEnrolment
from app.models import (
    ExternalPatientAccess,
    Feedback,
    MarketingPreferenceChange,
    NewsletterSend,
    PositionHolding,
    PractisingCompetency,
    ProfessionalRegistration,
    PushSubscription,
    User,
    UserCompetency,
    org_unit_member,
    user_role,
)
from app.security import hash_password

#: What emptying does with one column of ``users``.
Rule = Literal["kept", "wiped"]

#: Every column of ``users``, and what emptying does with it.
#:
#: **A new column must be added here**, or
#: ``emptying_test.py`` fails. Without that, a new field holding
#: something personal would be kept by default and nobody would notice.
COLUMN_RULES: dict[str, Rule] = {
    # The id is all the row is for.
    "id": "kept",
    # Unique and required, so each becomes a placeholder made from the
    # id, which frees the real one to be used again.
    "username": "wiped",
    "email": "wiped",
    "full_name": "wiped",
    # Replaced with the hash of a secret nobody keeps.
    "password_hash": "wiped",  # nosec B105 - a column name, not a secret
    "totp_secret": "wiped",  # nosec B105 - a column name, not a secret
    "is_totp_enabled": "wiped",
    # Stays false. An emptied account is a closed one.
    "is_active": "kept",
    # When it was closed and when it was emptied: dates, not a person.
    "deactivated_at": "kept",
    "emptied_at": "kept",
    "email_verified": "wiped",
    # Moved on, so any session still out there is refused.
    "token_version": "wiped",  # nosec B105 - a column name, not a secret
    "marketing_emails": "wiped",
    # The link to a patient's record.
    "fhir_patient_id": "wiped",
    "platform_role": "wiped",
    # What kind of work they did could help identify them in a small
    # team, so it goes. Mark, 14 October. Empty only on an emptied row.
    "base_profession": "wiped",
}

#: The domain of an emptied account's placeholder address. ``.invalid``
#: is reserved and can never receive mail.
PLACEHOLDER_DOMAIN = "deleted.invalid"

#: Moves one passport's files to the archive, given its id, and says
#: what it moved. Passed in, because only the admin job has an archive
#: to write to: see ``app.passport_storage.archive_passport``.
ArchivePassport = Callable[[str], list[str]]


class CannotEmpty(Exception):
    """An account that may not be emptied, and why."""


@dataclass(frozen=True)
class Emptied:
    """What emptying one account did.

    Attributes:
        user_id: The account.
        passport_objects: How many of its passport's files were moved to
            the archive. Nought for somebody with no passport.
    """

    user_id: int
    passport_objects: int


def placeholder_username(user_id: int) -> str:
    """What an emptied account's username becomes."""
    return f"deleted-{user_id}"


def placeholder_email(user_id: int) -> str:
    """What an emptied account's address becomes. It reaches nobody."""
    return f"deleted-{user_id}@{PLACEHOLDER_DOMAIN}"


def why_it_cannot_be_emptied(db: Session, user: User) -> str | None:
    """Why this account may not be emptied, or None when it may.

    Args:
        db: Database session.
        user: The account.

    Returns:
        The reason, in words fit to print, naming nobody.
    """
    if user.is_active:
        return "The account is open."

    if user.emptied_at is not None:
        return "The account is already empty."

    attempted = exists().where(Assessment.user_id == user.id)
    enrolled = exists().where(ModuleEnrolment.user_id == user.id)

    if db.scalar(select(attempted | enrolled)):
        return "The account still has training records."

    return None


def _delete_passport(
    db: Session, user: User, archive: ArchivePassport | None
) -> int:
    """Delete somebody's own passport and archive its files.

    The rows go first and are flushed, and the files move last, so
    that anything the database refuses is found before a file has
    moved. The caller commits straight afterwards.

    Returns:
        How many files were archived.

    Raises:
        CannotEmpty: If they have a passport and there is no archive to
            move it to.
    """
    passport = db.scalar(select(Passport).where(Passport.user_id == user.id))

    if passport is None:
        return 0

    if archive is None:
        raise CannotEmpty(
            "The account has a passport and there is no archive to move "
            "it to."
        )

    passport_id = passport.id

    for model in (
        PassportSignOffRequest,
        PassportLogbookConfirmationRequest,
        PassportAssessorInvite,
    ):
        db.execute(delete(model).where(model.passport_id == passport_id))

    db.delete(passport)
    db.flush()

    return len(archive(passport_id))


def _delete_what_they_held(db: Session, user: User) -> None:
    """Delete where they belonged, what they held and what they chose.

    A shell that still said "member of ward four, clinical lead from
    March" would identify somebody in a small team.
    """
    # Through the account, where it holds them as its own, so that the
    # session does not go on believing in rows that have gone.
    user.competency_grants.clear()
    user.registrations.clear()
    user.marketing_preference_changes.clear()
    user.roles.clear()
    db.flush()

    for model in (
        NewsletterSend,
        PushSubscription,
        PractisingCompetency,
        PositionHolding,
        ExternalPatientAccess,
        # Said again by name, for rows the account did not have loaded.
        UserCompetency,
        ProfessionalRegistration,
        MarketingPreferenceChange,
    ):
        db.execute(delete(model).where(model.user_id == user.id))

    for table in (org_unit_member, user_role):
        db.execute(delete(table).where(table.c.user_id == user.id))

    # Feedback is kept for its own two years, with nobody's name on it.
    db.execute(
        update(Feedback)
        .where(Feedback.user_id == user.id)
        .values(user_id=None)
    )
    db.flush()


def _wipe_the_row(user: User, now: datetime) -> None:
    """Blank everything on the row that said who it was."""
    user.username = placeholder_username(user.id)
    user.email = placeholder_email(user.id)
    user.full_name = None
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    user.totp_secret = None
    user.is_totp_enabled = False
    user.email_verified = False
    user.token_version += 1
    user.marketing_emails = False
    user.fhir_patient_id = None
    user.platform_role = "standard"
    user.base_profession = None
    user.emptied_at = now


def empty_account(
    db: Session,
    user: User,
    *,
    now: datetime,
    archive: ArchivePassport | None,
) -> Emptied:
    """Delete what a closed account's owner held and wipe its row.

    The rows are flushed, not committed: the caller commits, and should
    do so at once, because a passport's files have moved by the time
    this returns.

    Args:
        db: Database session.
        user: The account. Closed, with no training records left.
        now: The moment, recorded as when it was emptied.
        archive: Moves a passport's files to the archive. None where
            there is no archive, which refuses anybody with a passport.

    Returns:
        What was done.

    Raises:
        CannotEmpty: If the account is open, already empty, still has
            training records, or has a passport and nowhere to archive
            it. Nothing has been changed.
    """
    reason = why_it_cannot_be_emptied(db, user)

    if reason is not None:
        raise CannotEmpty(reason)

    # Checked before anything is deleted: see ``_delete_passport``.
    has_passport = db.scalar(
        select(exists().where(Passport.user_id == user.id))
    )

    if has_passport and archive is None:
        raise CannotEmpty(
            "The account has a passport and there is no archive to move "
            "it to."
        )

    _delete_what_they_held(db, user)
    _wipe_the_row(user, now)
    db.flush()

    # Last, because it is the one step a rollback cannot undo.
    passport_objects = _delete_passport(db, user, archive)

    return Emptied(user_id=user.id, passport_objects=passport_objects)
