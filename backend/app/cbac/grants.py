"""Keeping a person's ``user_competency`` rows in line with their lists.

Every route that changes somebody's competencies works in two lists,
``additional_competencies`` and ``removed_competencies``, and saves them
whole. This turns one such save into rows that change one at a time: an id
that has appeared gets a new row, an id that has gone has its current rows
closed. Written once so the rule cannot drift between the routes that call
it.

**Rows are inserted or closed, never deleted.** Closing sets ``ends_on`` to
now, so the row still says who held what, and until when.

**A competency that is sold carries its term on the row.** Granting
``passport_write`` writes its end date in the same act, so there is no
second table to remember and no state in which somebody holds the
competency with no term. See
``docs/docs/plans/2026-09-23-user-competency-table-plan.md``.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from app.features.passport.models import PASSPORT_ENTITLEMENT_DAYS
from app.models import User, UserCompetency

#: Competencies whose grant must carry a term, and how long a fresh one
#: lasts. An undated row would be current forever, and ``passport_write``
#: is sold. Its ``source`` is ``organisation`` whoever grants it here,
#: because what the value records for a term is who pays, and every route
#: that calls this acts for an organisation.
TERMS: dict[str, timedelta] = {
    "passport_write": timedelta(days=PASSPORT_ENTITLEMENT_DAYS),
}

#: What a termed row records as its source. See ``TERMS``.
TERM_SOURCE = "organisation"


def sync_competency_rows(
    user: User,
    *,
    additional: Iterable[str] | None,
    removed: Iterable[str] | None,
    source: str,
    granted_by: int | None = None,
    org_unit_id: int | None = None,
) -> None:
    """Bring a person's current rows into line with a pair of lists.

    Each list is compared with the person's current rows of the matching
    kind: grants against ``additional``, removals against ``removed``. An
    id in the list with no current row gets one. A current row whose id is
    no longer in the list is closed.

    A grant of a competency in ``TERMS`` is dated, and only a *current*
    row suppresses a new one. So saving the lists again, or adding
    somebody to a second org_unit, does not quietly extend a term that is
    running, while a term that has ended is granted afresh.

    The rows are added through ``user.competency_grants``, so they are
    visible on the same object straight away and are saved with it. The
    caller commits.

    Args:
        user: The person, modified in place.
        additional: Every competency they should hold beyond their base
            profession. None is read as empty.
        removed: Every competency their profession gives them that they
            should not hold. None is read as empty.
        source: How the change came about, one of
            ``COMPETENCY_GRANT_SOURCES``.
        granted_by: The user making the change, or None when nobody is
            signed in to be named.
        org_unit_id: The org_unit the change was made through, if any.
    """
    now = datetime.now(UTC)

    for granted, wanted_ids in (
        (True, set(additional or [])),
        (False, set(removed or [])),
    ):
        current: dict[str, list[UserCompetency]] = {}
        for row in user.competency_grants:
            if row.granted == granted and row.is_current(now):
                current.setdefault(row.competency_id, []).append(row)

        for competency_id in sorted(wanted_ids - current.keys()):
            term = TERMS.get(competency_id) if granted else None
            user.competency_grants.append(
                UserCompetency(
                    competency_id=competency_id,
                    granted=granted,
                    starts_on=now,
                    ends_on=now + term if term else None,
                    source=TERM_SOURCE if term else source,
                    granted_by=granted_by,
                    org_unit_id=org_unit_id,
                )
            )

        for competency_id in current.keys() - wanted_ids:
            for row in current[competency_id]:
                row.ends_on = now
