"""Who is at an org unit, and who leads it.

Adding somebody from the org unit's own page, with whatever they are
granted as they join, and naming the clinical lead. A sibling of
``settle_membership`` in :mod:`app.users.membership`, which writes the
same ``org_unit_member`` rows from the user form: that one settles every
org unit a person belongs to at once, this one records a single
membership and may change the person's competencies with it.
"""

from typing import Literal

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.cbac.base_professions import (
    competencies_kept_across_profession_change,
    resolve_user_competencies,
)
from app.cbac.grants import sync_competency_rows
from app.cbac.positions import set_clinical_lead
from app.features.passport import cover
from app.models import User, org_unit_member, validate_member_capacity
from app.org_units.access import (
    require_in_scope,
    require_visible,
    through_a_scope,
)
from app.org_units.errors import (
    CannotBeClinicalLead,
    NobodyBelongsHere,
    NobodyLeadsHere,
    NotAtThisPlace,
    UnknownCapacity,
    UserNotFound,
)
from app.org_units.types import type_can_have_members, type_can_hold_positions
from app.users.scope import check_account_in_scope, check_profession_in_scope


def known_capacity(value: str) -> str:
    """Return the capacity, or refuse naming the known ones.

    Raises:
        UnknownCapacity: If the vocabulary does not hold it.
    """
    try:
        return validate_member_capacity(value)
    except ValueError:
        raise UnknownCapacity() from None


def add_member(
    db: Session,
    caller: User,
    unit_id: int,
    *,
    user_id: int,
    capacity: str,
    base_profession: str | None,
    additional_competencies: list[str] | None,
) -> Literal["added", "updated"]:
    """Record that somebody is at an org_unit, in a given capacity.

    The grant goes in with the membership. Adding somebody and then
    separately remembering to give them competencies is two steps that
    can be half-done, and the half-done state is a new starter who can
    reach nothing.

    Recording the same membership twice changes the capacity rather than
    failing.

    A caller who reaches this only through a scoped manager, such as
    ``manage_teaching``, may add anybody, grants only what it may grant,
    and gives a profession or changes an existing capacity only for
    somebody whose every competency it may grant.

    The membership is written before the scope checks are made, as it
    always was, so a refusal relies on the caller's transaction being
    rolled back. The rows are flushed, not committed.

    Args:
        db: Core database session.
        caller: Who is asking, recorded as who granted and who changed
            passport cover.
        unit_id: The org_unit.
        user_id: The person.
        capacity: What they are here, as the request gave it.
        base_profession: A profession to move them to, or None to leave
            theirs. One the catalogue knows: a refusal repeats it.
        additional_competencies: Competencies to grant on top of what
            they hold, or None.

    Returns:
        ``"added"`` for a new membership, ``"updated"`` for one they
        already had.

    Raises:
        OrgUnitNotFound: If no org_unit has that id, or one does that
            the caller may not see.
        NobodyBelongsHere: If the org_unit's type has no members.
        UnknownCapacity: If the vocabulary does not hold the capacity.
        UserNotFound: If nobody has that id.
        AccountOutOfScope: If a scoped manager would change the capacity
            or the profession of an account holding more than it may
            grant. From :mod:`app.users.errors`.
        ProfessionOutOfScope: If a scoped manager may not give the
            profession. From :mod:`app.users.errors`.
        CompetenciesOutOfScope: If a scoped manager would grant or
            remove a competency outside its whitelist.
    """
    unit = require_visible(db, caller, unit_id, "manage_staff_membership")

    if not type_can_have_members(unit.type):
        raise NobodyBelongsHere(unit.type)

    capacity = known_capacity(capacity)

    person = db.get(User, user_id)

    if person is None:
        raise UserNotFound()

    existing = db.scalar(
        select(org_unit_member.c.capacity).where(
            org_unit_member.c.org_unit_id == unit_id,
            org_unit_member.c.user_id == user_id,
        )
    )
    status: Literal["added", "updated"]

    if existing is None:
        db.execute(
            insert(org_unit_member).values(
                org_unit_id=unit_id,
                user_id=user_id,
                capacity=capacity,
            )
        )
        status = "added"
    else:
        db.execute(
            org_unit_member.update()
            .where(
                org_unit_member.c.org_unit_id == unit_id,
                org_unit_member.c.user_id == user_id,
            )
            .values(capacity=capacity)
        )
        status = "updated"

    held_before: set[str] | None

    if through_a_scope(caller, "manage_staff_membership"):
        # Anybody may be added: being at an org_unit is not a change to
        # their account, and somebody running the passport at a site
        # has to be able to bring a consultant into it. What stays
        # limited is everything that *is* a change to the account: the
        # capacity of somebody already here, a new profession, and
        # (below) the competencies granted.
        if existing is not None or base_profession is not None:
            check_account_in_scope(caller, person)
        if base_profession is not None:
            check_profession_in_scope(caller, base_profession)
        held_before = set(person.get_final_competencies())
    else:
        held_before = None

    # Read against the profession they have now, before any change to it:
    # asked afterwards, the new profession's competencies would all read
    # as "not held" and be kept from them.
    removed = person.removed_competency_ids
    outside = set(person.additional_competency_ids)

    if base_profession is not None:
        outside = set(
            competencies_kept_across_profession_change(
                outside,
                old_profession=person.base_profession,
                new_profession=base_profession,
            )
        )
        person.base_profession = base_profession

    # Granted on top of whatever they already held, never in its place.
    outside.update(additional_competencies or [])
    additional = sorted(outside)

    if held_before is not None:
        require_in_scope(
            caller,
            held_before
            ^ set(
                resolve_user_competencies(
                    person.base_profession, additional, removed
                )
            ),
        )
    # The term comes with the grant, for the reason the grant comes with
    # the membership: `passport_write` is written with its end date in
    # the same row, so a new starter is never left holding it with no
    # term, able to open their passport and not write to it.
    sync_competency_rows(
        person,
        additional=additional,
        removed=removed,
        source="admin",
        granted_by=caller.id,
        org_unit_id=unit_id,
    )
    cover.membership_changed(
        db,
        unit_id,
        user_id,
        before=existing,
        after=capacity,
        changed_by=caller,
    )

    db.flush()

    return status


def name_clinical_lead(
    db: Session, caller: User, unit_id: int, user_id: int | None
) -> Literal["set", "vacant"]:
    """Name the clinical lead of an org_unit, or leave the post vacant.

    A post is not a competency: it can be vacant, and "this ward has no
    clinical lead" is a real and actionable state. Passing no person
    vacates it.

    Whoever holds it is stood down first, so a handover is recorded
    rather than the previous holder simply vanishing.

    The person has to be at the org_unit already. Naming somebody who is
    not would make the post say they are involved here when nothing else
    does.

    The rows are flushed, not committed.

    Args:
        db: Core database session.
        caller: Who is asking, recorded as who appointed.
        unit_id: The org_unit.
        user_id: Who is to hold the post, or None to vacate it.

    Returns:
        ``"set"`` when somebody holds the post, ``"vacant"`` when nobody
        does.

    Raises:
        OrgUnitNotFound: If no org_unit has that id, or one does that
            the caller may not see.
        NobodyLeadsHere: If the org_unit's type holds no positions.
        UserNotFound: If nobody has that id.
        NotAtThisPlace: If they are not a member of the org_unit.
        CannotBeClinicalLead: If the post refuses them.
    """
    unit = require_visible(db, caller, unit_id, "manage_staff_membership")

    if not type_can_hold_positions(unit.type):
        raise NobodyLeadsHere(unit.type)

    lead: User | None = None

    if user_id is not None:
        lead = db.get(User, user_id)
        if lead is None:
            raise UserNotFound()

        at_this_org_unit = db.scalar(
            select(org_unit_member.c.user_id).where(
                org_unit_member.c.org_unit_id == unit_id,
                org_unit_member.c.user_id == user_id,
            )
        )
        if at_this_org_unit is None:
            raise NotAtThisPlace()

    try:
        set_clinical_lead(db, unit, lead, appointed_by=caller)
    except ValueError:
        # The post refused them: it is full, or asks for a competency
        # they may not practise here. Said in words written elsewhere,
        # since a caught exception's text must not reach a client, and
        # as a 409, not left to surface as a 500.
        raise CannotBeClinicalLead() from None
    db.flush()

    return "vacant" if lead is None else "set"
