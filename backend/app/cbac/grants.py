"""Keeping a person's ``user_competency`` rows in line with their lists.

Every route that changes somebody's competencies works in two lists,
``additional_competencies`` and ``removed_competencies``, and saves them
whole. This turns one such save into rows that change one at a time: an id
that has appeared gets a new row, an id that has gone has its current rows
closed. Written once so the rule cannot drift between the routes that call
it.

**Rows are inserted or closed, never deleted.** Closing sets ``ends_on`` to
now, so the row still says who held what, and until when.

While the JSON columns remain the source of truth, the lists passed here are
the ones just written to them, and nothing reads the rows yet. See
``docs/docs/plans/2026-09-23-user-competency-table-plan.md``.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime

from app.models import User, UserCompetency

#: Competencies whose grant must carry a term, so this module never opens
#: one. An undated row would be current forever, and ``passport_write`` is
#: sold: its rows come only from the entitlement that says until when. It
#: is still *closed* here like anything else, because taking it off the
#: list is how an administrator takes it away.
TERMED_COMPETENCIES: frozenset[str] = frozenset({"passport_write"})


def is_current(row: UserCompetency, now: datetime) -> bool:
    """Whether a row is still in force at ``now``.

    Current means no end, or an end still in the future. SQLite hands back
    naive datetimes where Postgres hands back aware ones, so a naive value
    is read as UTC, which is what every writer stores.

    Args:
        row: The grant or removal to check.
        now: An aware datetime to check against.

    Returns:
        True while the row is in force.
    """
    if row.ends_on is None:
        return True
    ends_on = row.ends_on
    if ends_on.tzinfo is None:
        ends_on = ends_on.replace(tzinfo=UTC)
    return ends_on > now


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

    Somebody with no rows yet — anybody not saved since the table arrived
    — gets a row for every id in both lists, so after one save their rows
    match their lists exactly.

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
            if row.granted == granted and is_current(row, now):
                current.setdefault(row.competency_id, []).append(row)

        for competency_id in sorted(wanted_ids - current.keys()):
            if granted and competency_id in TERMED_COMPETENCIES:
                continue
            user.competency_grants.append(
                UserCompetency(
                    competency_id=competency_id,
                    granted=granted,
                    starts_on=now,
                    source=source,
                    granted_by=granted_by,
                    org_unit_id=org_unit_id,
                )
            )

        for competency_id in current.keys() - wanted_ids:
            for row in current[competency_id]:
                row.ends_on = now
