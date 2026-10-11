"""Settling what somebody holds when their page is saved.

What a person holds is their ``user_competency`` rows. The edit page
describes them as two lists read against a base profession: what they
hold beyond it, and what it gives that they do not hold. This module
works out what those two lists come to once a change of profession and
a change of platform role are taken into account, checks the caller may
make the change, and writes the rows once.

The profession and the platform role are set here as well, because
neither can be separated from the lists: a new profession decides what
is carried over, and a promotion to operator adds to what is held.
"""

from collections.abc import Iterable

from app.cbac.base_professions import (
    SUPERADMIN_PROFESSION,
    competencies_kept_across_profession_change,
    get_profession_base_competencies,
    resolve_user_competencies,
)
from app.cbac.grants import sync_competency_rows
from app.models import User
from app.users.errors import SuperadminRoleNotAllowed
from app.users.scope import check_changes_in_scope


def settle_competencies(
    user: User,
    actor: User,
    *,
    held_before: set[str],
    base_profession: str | None = None,
    additional_competencies: Iterable[str] | None = None,
    removed_competencies: Iterable[str] | None = None,
    platform_role: str | None = None,
) -> None:
    """Bring somebody's profession, platform role and rows up to date.

    A field left as ``None`` was not sent, and is not touched. The rows
    are written even when all four are ``None``: both lists then come
    from the rows the person already has, so nothing changes.

    Nothing is flushed. The caller's transaction decides whether the
    change is kept, so a refusal part-way through leaves nothing behind
    once that transaction is rolled back.

    Args:
        user: The account to change.
        actor: The caller, recorded as who granted each new row.
        held_before: What the person held when the request arrived, for
            the comparison that decides what the caller is changing.
        base_profession: The profession to give them.
        additional_competencies: What they are to hold beyond their
            profession, replacing what they held beyond it.
        removed_competencies: What their profession gives that they are
            not to hold.
        platform_role: The platform role to give them.

    Raises:
        SuperadminRoleNotAllowed: If the caller is not an operator and
            the platform role asked for is ``superadmin``.
        CompetenciesOutOfScope: If the change grants or removes a
            competency outside the caller's scope.
    """
    # Both lists start from the person's current rows, and are settled
    # here before anything is written.
    additional = user.additional_competency_ids
    removed = user.removed_competency_ids

    # Named explicitly, the list replaces what they held outside their
    # profession. A profession change is then worked out on top of it, so
    # a payload carrying both fields does not discard what the old
    # profession granted.
    if additional_competencies is not None:
        additional = list(additional_competencies)

    # A profession is a template, not state: `additional` and `removed`
    # exist precisely so reality can diverge from it. So changing one
    # *adds* what the new profession grants and keeps what the person has
    # already become - a patient who becomes a healthcare assistant keeps
    # the competency for their own record, rather than losing it by being
    # given a clinical role.
    #
    # Assigning the field alone dropped every competency from the old
    # profession unless it happened to be listed in
    # `additional_competencies`, silently. The superadmin promotion below
    # has always merged for the same reason.
    if base_profession is not None:
        additional = competencies_kept_across_profession_change(
            additional,
            old_profession=user.base_profession,
            new_profession=base_profession,
        )
        user.base_profession = base_profession

    if removed_competencies is not None:
        removed = list(removed_competencies)

    if platform_role is not None:
        additional = _set_platform_role(user, actor, platform_role, additional)

    check_changes_in_scope(
        actor,
        held_before,
        set(
            resolve_user_competencies(
                user.base_profession, additional, removed
            )
        ),
    )

    # Written once, from the lists as finally settled above: after the
    # profession carry-over and the superadmin promotion, not before.
    sync_competency_rows(
        user,
        additional=additional,
        removed=removed,
        source="admin",
        granted_by=actor.id,
    )


def _set_platform_role(
    user: User, actor: User, platform_role: str, additional: list[str]
) -> list[str]:
    """Give *user* the platform role, and hand back what they now add.

    The list handed back is *additional*, with the operator competencies
    merged in when the role is ``superadmin``.
    """
    additional = additional_for_platform_role(actor, platform_role, additional)
    user.platform_role = platform_role

    return additional


def additional_for_platform_role(
    actor: User, platform_role: str, additional: list[str]
) -> list[str]:
    """What somebody given *platform_role* holds beyond their profession.

    The one rule for making an operator, asked both when a page is saved
    and when an account is made, so the two cannot differ. Nothing is
    written: the caller sets the role and writes the rows.

    Args:
        actor: The caller.
        platform_role: The platform role the person is to have.
        additional: What they are to hold beyond their profession.

    Returns:
        *additional* as it was, unless the role is ``superadmin``, when
        the operator competencies are merged into it.

    Raises:
        SuperadminRoleNotAllowed: If the caller is not an operator and
            the role is ``superadmin``.
    """
    # Only an operator may make another. The competency that opens
    # this route says *what* someone may administer and never that
    # they may promote someone to run the platform.
    if actor.platform_role != "superadmin" and platform_role == "superadmin":
        raise SuperadminRoleNotAllowed()

    if platform_role != "superadmin":
        return additional

    # An operator holding no profession competencies would be refused by
    # every gate, so the promotion merges them in beside whatever the
    # person already holds, as a change of profession does.
    granted = set(additional)
    granted.update(get_profession_base_competencies(SUPERADMIN_PROFESSION))

    return sorted(granted)
