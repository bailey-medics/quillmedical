"""Saving somebody's page: the whole change, in one place.

The user form sends everything about a person in one request, and the
modules beside this one each settle a part of it. This module joins
them up: it works out what the request would change, checks the caller
may make that change, and calls the parts in the one order that is
right.

The order is the rule. The checks on who may ask come before anything
is changed; who somebody is comes before what they hold; what they hold
and where they belong come before where they practise, which is checked
against both; and teaching enrolments come last, so a place the form
gave is already there.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User, normalise_email, org_unit_member
from app.users.competencies import settle_competencies
from app.users.enrolments import settle_teaching_enrolments
from app.users.identity import change_identity
from app.users.membership import settle_membership
from app.users.practice import settle_practice
from app.users.scope import (
    check_account_in_scope,
    check_may_set_platform_role,
    check_not_granting_to_self,
    check_profession_in_scope,
)


@dataclass(frozen=True)
class AccountChanges:
    """What one save of somebody's page sent.

    Every field is ``None`` when it was not sent, and a field not sent
    is not touched. Sent empty is a different answer from not sent for
    all but two of them, which are noted below.

    Attributes:
        username: The new username.
        name: The new full name. A blank one clears it.
        email: The new address.
        password: The new password. An empty one is not a change.
        base_profession: The profession to give them.
        additional_competencies: What they are to hold beyond their
            profession. An empty list means nothing beyond it.
        removed_competencies: What their profession gives that they are
            not to hold. An empty list means nothing is withheld.
        platform_role: The platform role to give them.
        org_unit_ids: Every org unit, of those the caller may place
            people in, that they are to belong to. An empty list takes
            them off all of those.
        practising: For each org unit sent, what they may practise
            there. Naming no org unit is the same as not sending it.
        teaching_enrolments: For each organisation sent, each module
            they are to be enrolled on and when that ends. Naming no
            organisation changes nothing, but it is still asked whether
            the caller may settle enrolments at all.
    """

    username: str | None = None
    name: str | None = None
    email: str | None = None
    password: str | None = None
    base_profession: str | None = None
    additional_competencies: list[str] | None = None
    removed_competencies: list[str] | None = None
    platform_role: str | None = None
    org_unit_ids: list[int] | None = None
    practising: dict[int, list[str]] | None = None
    teaching_enrolments: dict[int, dict[str, datetime | None]] | None = None


def changes_profession(user: User, changes: AccountChanges) -> bool:
    """Whether the save would give *user* a profession they do not have."""
    return (
        changes.base_profession is not None
        and changes.base_profession != user.base_profession
    )


def changes_platform_role(user: User, changes: AccountChanges) -> bool:
    """Whether the save would give *user* a platform role they do not have."""
    return (
        changes.platform_role is not None
        and changes.platform_role != user.platform_role
    )


def acts_on_whole_account(
    user: User, changes: AccountChanges, *, member_of: set[int]
) -> bool:
    """Whether the save would change more than what somebody holds.

    Anything beyond the competency lists acts on the account as a whole,
    which a limited scope reaches only for somebody whose every
    competency it could have given.

    A field counts only when it would change something. The user form
    sends every field on every save, so asking whether a field was sent
    would refuse a teaching admin who changed only a delegate's
    teaching competencies, or anybody's, because the form also carried
    their unchanged name.

    Where they practise and what they are enrolled on are not asked
    about here: each has its own check on who may settle it.

    Args:
        user: The person whose page is being saved, as they are now.
        changes: What the save sent.
        member_of: Every org unit they belong to, as ``get_user``
            reports them and so as the form sends them back.

    Returns:
        True if the profession, the platform role, the username, the
        name, the address or the org units would differ from what is
        held, or a password was sent.
    """
    return (
        changes_profession(user, changes)
        or changes_platform_role(user, changes)
        or bool(changes.password)
        or (
            changes.username is not None
            and changes.username.strip() != user.username
        )
        or (
            changes.name is not None
            and changes.name.strip() != (user.full_name or "")
        )
        or (
            # As it would be stored, so the same address in other
            # capitals is no change: every address is held in lower case.
            changes.email is not None
            and normalise_email(changes.email) != user.email
        )
        or (
            changes.org_unit_ids is not None
            and set(changes.org_unit_ids) != member_of
        )
    )


def update_account(
    db: Session, actor: User, user: User, changes: AccountChanges
) -> None:
    """Make every change one save of somebody's page asked for.

    The checks on who may ask run first, in a fixed order, so when two
    things are wrong the same one is always reported. Then the parts
    are settled, each refusing in its own words: see the module each
    lives in for what it raises.

    The caller has already found the person and decided the caller may
    reach them at all. Everything is flushed and nothing is committed:
    the caller's transaction decides whether the change is kept, so a
    refusal part-way through leaves nothing behind once that transaction
    is rolled back.

    Args:
        db: Core database session.
        actor: The caller.
        user: The person whose page is being saved.
        changes: What the save sent.

    Raises:
        AccountOutOfScope: If the save acts on the whole account and
            the account is outside the caller's scope.
        ProfessionOutOfScope: If it gives a profession the caller may
            not give.
        PlatformRoleNotAllowed: If it sets a platform role and the
            caller's scope has a limit.
        SelfGranting: If the caller is saving their own page with a
            profession, a competency list or a platform role on it.
        UserAdminError: Whatever a part refuses, in the order identity,
            competencies, membership, practice, enrolments.
    """
    member_of = _org_units_they_belong_to(db, user)
    gives_profession = changes_profession(user, changes)

    if acts_on_whole_account(user, changes, member_of=member_of):
        check_account_in_scope(actor, user)
    if gives_profession and changes.base_profession is not None:
        check_profession_in_scope(actor, changes.base_profession)

    check_may_set_platform_role(
        actor, sets_platform_role=changes_platform_role(user, changes)
    )

    held_before = set(user.get_final_competencies())

    # Sent is enough: the user form carries all four on every save, so
    # an administrator saving their own page is refused whether or not
    # anything differs. Why nobody grants to themselves is told where
    # the rule is.
    check_not_granting_to_self(
        actor,
        user,
        sends_granting_field=(
            changes.base_profession is not None
            or changes.additional_competencies is not None
            or changes.removed_competencies is not None
            or changes.platform_role is not None
        ),
    )

    change_identity(
        db,
        user,
        username=changes.username,
        name=changes.name,
        email=changes.email,
        password=changes.password,
    )

    settle_competencies(
        user,
        actor,
        held_before=held_before,
        base_profession=changes.base_profession,
        additional_competencies=changes.additional_competencies,
        removed_competencies=changes.removed_competencies,
        platform_role=changes.platform_role,
    )

    # The one list, in org unit ids. Left out, membership is not touched.
    if changes.org_unit_ids is not None:
        settle_membership(db, actor, user, changes.org_unit_ids)

    # Flush before refreshing: refresh reloads the row from the database,
    # so pending in-memory changes are discarded unless they have been
    # written first. The assignments above happen to survive because the
    # session flushes automatically on the queries between them; an
    # assignment after the last query would not.
    db.flush()
    db.refresh(user)

    # After membership and competencies, because practice is checked
    # against both as they now stand. The test is for its truth: with no
    # org unit named there is nothing to settle.
    if changes.practising:
        settle_practice(db, actor, user, changes.practising)

    # After practice, so a place the form set is already there and
    # naming a module adds only what is still missing. An empty list for
    # an organisation is an answer, ending what they are on, so the
    # test is for the field and not for its truth.
    if changes.teaching_enrolments is not None:
        settle_teaching_enrolments(
            db, actor, user, changes.teaching_enrolments
        )


def _org_units_they_belong_to(db: Session, user: User) -> set[int]:
    """Every org unit *user* is a member of, whoever administers it."""
    return set(
        cast(
            Sequence[int],
            db.execute(
                select(org_unit_member.c.org_unit_id).where(
                    org_unit_member.c.user_id == user.id
                )
            )
            .scalars()
            .all(),
        )
    )
