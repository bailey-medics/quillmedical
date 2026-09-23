"""Keeping a person's ``user_competency`` rows in line with their lists.

Every route that changes somebody's competencies works in two lists,
``additional_competencies`` and ``removed_competencies``, and saves them
whole. This turns one such save into rows that change one at a time: an id
that has appeared gets a new row, an id that has gone has its current rows
closed. Written once so the rule cannot drift between the routes that call
it.

**Rows are inserted or closed, never deleted.** Closing sets ``ends_on`` to
now, so the row still says who held what, and until when.

**The base profession seeds rows.** Whatever somebody's profession grants
is written as rows with ``source`` ``profession`` when they are given it,
so what they hold is recorded against them rather than read from the
template on every request.

**A term, where there is one, is on the row.** A grant through a site or
organisation has none. A subscription somebody buys for themselves would
carry its end date on the same row as the grant, so there is no second
table to remember. See
``docs/docs/plans/2026-09-23-user-competency-table-plan.md``.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from app.cbac.base_professions import (
    get_profession_base_competencies,
    resolve_user_competencies,
)
from app.features.passport.models import PASSPORT_ENTITLEMENT_DAYS
from app.models import User, UserCompetency

#: How long a grant lasts, by who pays for it. A grant through a site or an
#: organisation has no end: somebody given ``passport_write`` by the trust
#: they work at keeps it. A subscription somebody buys for themselves
#: (``source`` ``individual``) runs for a year and then lapses. Nothing
#: writes individual grants yet; the term is here so the first thing that
#: does gets it without a second rule.
TERMS: dict[str, timedelta] = {
    "individual": timedelta(days=PASSPORT_ENTITLEMENT_DAYS),
}

#: What a row seeded from somebody's base profession records as its source.
PROFESSION_SOURCE = "profession"


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

    The two lists are read against the person's base profession, as the
    edit page presents them: ``additional`` is what they hold beyond it,
    ``removed`` what it gives that they do not hold. So the competencies
    they should hold are the profession's template, plus ``additional``,
    minus ``removed``, and their current grant rows are brought into line
    with that: an id with no current row gets one, a current row whose id
    is no longer held is closed.

    **The profession seeds rows.** A row opened for a competency in the
    template, and not asked for in ``additional``, has ``source``
    ``profession``. Changing somebody's profession therefore adds rows for
    what the new one grants and closes nothing, and somebody with no rows
    yet gets the whole template as rows on their first save.

    No removal row is written. Somebody who does not hold a competency
    simply has no current grant row for it, and taking one away closes its
    row, as everything else is taken away.

    A grant whose ``source`` is in ``TERMS`` is dated, and only a
    *current* row suppresses a new one. So saving the lists again does not
    quietly extend a term that is running, while a term that has ended is
    granted afresh.

    The rows are added through ``user.competency_grants``, so they are
    visible on the same object straight away and are saved with it. The
    caller commits.

    Args:
        user: The person, modified in place. Their ``base_profession``
            must already be the one the lists are read against.
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
    template = set(get_profession_base_competencies(user.base_profession))
    asked = set(additional or [])
    wanted_ids = set(
        resolve_user_competencies(
            user.base_profession, sorted(asked), list(removed or [])
        )
    )

    current: dict[str, list[UserCompetency]] = {}
    for row in user.competency_grants:
        if row.is_current(now):
            current.setdefault(row.competency_id, []).append(row)

    for competency_id in sorted(wanted_ids - current.keys()):
        if competency_id in template and competency_id not in asked:
            row_source = PROFESSION_SOURCE
        else:
            row_source = source
        term = TERMS.get(row_source)
        user.competency_grants.append(
            UserCompetency(
                competency_id=competency_id,
                starts_on=now,
                ends_on=now + term if term else None,
                source=row_source,
                granted_by=granted_by,
                org_unit_id=org_unit_id,
            )
        )

    for competency_id in current.keys() - wanted_ids:
        for row in current[competency_id]:
            row.ends_on = now
