"""Deactivating a site, and the accounts left belonging nowhere.

A site that stops taking part, say one that no longer wants the service,
is deactivated rather than deleted. Deleting it would leave its people
belonging nowhere, and its results are kept for years. A deactivated
site takes no more registrations and nobody can be added to it.

Its people who belong nowhere else are deactivated with it, each as an
admin deactivating them by hand would: they can no longer sign in, the
clock on keeping their records starts, and they are emailed to say so.

Belonging somewhere else is read the way the admin pages show it. An
organisation's page lists its ``staff`` members, and a site's page lists
everybody there. So a person is spared when they are a member of any
other org_unit in use, except as a ``trainee`` of the site's own
organisation: that row is what registering at the site wrote, and it
appears on no list. Somebody a teaching admin added to the
organisation's staff list is on that list, and is spared.

Phase 15 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, User, org_unit_member
from app.org_units.errors import (
    AlreadyDeactivated,
    OrganisationNotDeactivatedHere,
)
from app.org_units.tree import root_ids_of
from app.users.activation import deactivate_account
from app.users.closure_notice import ClosureNotice, closure_notice_for
from app.users.errors import UserAdminError
from app.users.reach import account_the_caller_may_act_on


def accounts_left_nowhere(
    db: Session, actor: User, site: OrgUnit
) -> list[User]:
    """The open accounts deactivating *site* would close.

    Its members whose accounts are open, who belong to no other org_unit
    in use but as a ``trainee`` of the site's own organisation, and whom
    the caller may act on. Never the caller: nobody closes their own
    account here.

    Args:
        db: Core database session.
        actor: The caller.
        site: The site to be deactivated.

    Returns:
        The accounts, in id order.
    """
    organisation = root_ids_of(db, [site.id]).get(site.id)
    member_ids: list[int] = list(
        db.scalars(
            select(org_unit_member.c.user_id).where(
                org_unit_member.c.org_unit_id == site.id
            )
        ).all()
    )
    closing: list[User] = []

    for user_id in sorted(set(member_ids)):
        if user_id == actor.id or _belongs_elsewhere(
            db, user_id, site.id, organisation
        ):
            continue

        try:
            user = account_the_caller_may_act_on(db, actor, user_id)
        except UserAdminError:
            # Out of the caller's reach: left as it is, and not counted.
            continue

        if user.is_active:
            closing.append(user)

    return closing


def deactivate_site(
    db: Session, actor: User, site: OrgUnit
) -> tuple[int, list[ClosureNotice]]:
    """Deactivate *site*, and the accounts of people left belonging nowhere.

    Flushed, never committed. The closure emails are handed back to be
    sent once the request has answered, as deactivating one account by
    hand sends its own.

    Args:
        db: Core database session.
        actor: The caller, who has been checked may edit the site.
        site: The site.

    Returns:
        How many accounts were closed, and the closure email for each
        that is due one: an address nobody verified is sent none.

    Raises:
        OrganisationNotDeactivatedHere: If the org_unit is the top of a
            tree.
        AlreadyDeactivated: If it is already deactivated.
    """
    if site.parent_id is None:
        raise OrganisationNotDeactivatedHere()

    if not site.is_active:
        raise AlreadyDeactivated()

    closing = accounts_left_nowhere(db, actor, site)
    notices: list[ClosureNotice] = []

    for user in closing:
        closed = deactivate_account(db, actor, user.id)
        notice = closure_notice_for(db, closed)
        if notice is not None:
            notices.append(notice)

    site.is_active = False
    db.flush()

    return len(closing), notices


def _belongs_elsewhere(
    db: Session, user_id: int, site_id: int, organisation_id: int | None
) -> bool:
    """Whether a member of the site is on another org_unit's list."""
    rows = db.execute(
        select(org_unit_member.c.org_unit_id, org_unit_member.c.capacity)
        .join(OrgUnit, OrgUnit.id == org_unit_member.c.org_unit_id)
        .where(
            org_unit_member.c.user_id == user_id,
            org_unit_member.c.org_unit_id != site_id,
            OrgUnit.is_active.is_(True),
        )
    ).all()

    return any(
        not (org_unit_id == organisation_id and capacity == "trainee")
        for org_unit_id, capacity in rows
    )
