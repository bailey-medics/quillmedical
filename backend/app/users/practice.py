"""Where somebody may practise, as the user form settles it.

The user form sends, for each org unit it showed, the whole list of
competencies a person may practise there. This module works out what
that changes, asks :func:`app.org_units.practice.practice_refusal`
whether the caller may make each change, and hands the changes to
``authorise_practice`` and ``withdraw_practice`` in
:mod:`app.cbac.practising`, which do the writing.
"""

from collections.abc import Sequence
from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.competencies import SCOPED_MANAGER_IDS
from app.cbac.practising import (
    authorise_practice,
    authorised_at,
    withdraw_practice,
)
from app.models import User, org_unit_member
from app.org_units.errors import OrgUnitError
from app.org_units.practice import practice_refusal
from app.users.errors import (
    PracticeNotAllowed,
    PracticeRefused,
    PractisingWhereNotAMember,
)


def settle_practice(
    db: Session,
    actor: User,
    person: User,
    wanted: dict[int, list[str]],
) -> None:
    """Make a person's practice rows match what the user form sent.

    Called once their membership and competencies are settled and
    flushed, in the same transaction, so a new starter is never left
    created and authorised nowhere.

    For each org unit sent, the list is the whole answer for the
    competencies the person now holds: listed ones are authorised there,
    and ones they hold and are not listed are withdrawn. Three things
    are deliberately left alone:

    - **An org unit that was not sent.** The form names only the
      org units it showed, so an admin who cannot see one does not
      empty it by saving.
    - **A row for a competency outside their ceiling.** Those are the
      "authorised here but not held" rows the member practice page
      shows on purpose, and the form has no switch for them. Its
      silence about one is not an instruction to withdraw it.
    - **A row that does not change.** It keeps who authorised it and
      when; ``authorise_practice`` writes nothing for a repeat.

    Every change is checked before any is written, and one refusal
    refuses the save: this is one request and one transaction, and a
    user half created is worse than one not created. A list that
    changes nothing is never refused, because the form sends every
    field on every save.

    *wanted* is a mapping, so it cannot name an org unit twice. The
    request model refuses that as the request is read, so a route
    turning its list into this mapping loses nothing.

    The rows are flushed, not committed: ``authorise_practice`` and
    ``withdraw_practice`` each send what they write.

    Args:
        db: Core database session.
        actor: The caller.
        person: Whose practice it is, with membership and competencies
            already settled.
        wanted: For each org unit to settle, by its id and in the order
            sent, the competency ids they may practise there. An org
            unit left out is not touched.

    Raises:
        PractisingWhereNotAMember: For an org unit the person does not
            belong to.
        PracticeNotAllowed: If something would change and the caller
            may not set practice at all.
        PracticeRefused: For changes the caller may not make, with every
            such change named.
    """
    member_of = set(
        cast(
            Sequence[int],
            db.execute(
                select(org_unit_member.c.org_unit_id).where(
                    org_unit_member.c.user_id == person.id
                )
            )
            .scalars()
            .all(),
        )
    )
    strangers = sorted(
        org_unit_id for org_unit_id in wanted if org_unit_id not in member_of
    )

    if strangers:
        raise PractisingWhereNotAMember(strangers)

    held = set(person.get_final_competencies())
    # (org unit, competency, authorising), in the order they were sent.
    changes: list[tuple[int, str, bool]] = []

    for org_unit_id, competencies in wanted.items():
        current = authorised_at(db, person.id, org_unit_id=org_unit_id)
        listed = set(competencies)
        changes.extend(
            (org_unit_id, competency, True)
            for competency in sorted(listed - current)
        )
        changes.extend(
            (org_unit_id, competency, False)
            for competency in sorted((current & held) - listed)
        )

    if not changes:
        return

    # The practice routes sit behind a dependency asking this; the user
    # routes admit `manage_users` alone, which is not authority to set
    # where somebody practises.
    callers = set(actor.get_final_competencies())

    if "manage_practising_competencies" not in callers and callers.isdisjoint(
        SCOPED_MANAGER_IDS
    ):
        raise PracticeNotAllowed()

    refusals: list[OrgUnitError] = []

    for org_unit_id, competency, authorising in changes:
        refusal = practice_refusal(
            db,
            actor,
            unit_id=org_unit_id,
            user_id=person.id,
            competency=competency,
            authorising=authorising,
        )
        if refusal is not None:
            refusals.append(refusal)

    if refusals:
        raise PracticeRefused(refusals)

    for org_unit_id, competency, authorising in changes:
        if authorising:
            authorise_practice(
                db,
                user_id=person.id,
                org_unit_id=org_unit_id,
                competency=competency,
                authorised_by=actor.id,
            )
        else:
            withdraw_practice(
                db,
                user_id=person.id,
                org_unit_id=org_unit_id,
                competency=competency,
            )
