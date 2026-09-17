"""Keep a place id in step with an organisation id, row by row.

Several tables answer "which organisation?" with a row id from
``organisations``, a table that is going: an organisation is a place at
the top of a tree, and a place id is the only id there will be. Each of
them has gained an ``org_unit_id`` beside the older column, and the two
have to agree on every row written while both exist.

**Why a listener rather than a line at each write.** There are eight
tables, and the writers are not only the eight places the application
creates these rows: fixtures, scripts and anything written next also
write them. A row carrying only the old column is invisible to the reads
that now use the new one, and nothing says so — the reader simply finds
less than there is. One mechanism covers every writer, including the
ones nobody has thought of yet.

It fills whichever of the two is missing from whichever is present, and
never overwrites either: a writer that knows only the organisation is
served, and so is one that knows only the place. That second direction
is what lets code move across a writer at a time.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import event, select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapper


def _keep_the_pair_in_step(
    _mapper: Mapper[Any], connection: Connection, target: Any
) -> None:
    """Fill whichever of the two ids is missing, from the other."""
    from app.models import Organisation

    if target.org_unit_id is None and target.organisation_id is not None:
        target.org_unit_id = connection.scalar(
            select(Organisation.org_unit_id).where(
                Organisation.id == target.organisation_id
            )
        )
        return

    if target.organisation_id is None and target.org_unit_id is not None:
        target.organisation_id = connection.scalar(
            select(Organisation.id).where(
                Organisation.org_unit_id == target.org_unit_id
            )
        )


def mirror_the_organisations_place(*models: type) -> None:
    """Have each model keep its organisation and place ids in step.

    Args:
        models: Mapped classes carrying both ``organisation_id`` and
            ``org_unit_id``.
    """
    for model in models:
        event.listen(model, "before_insert", _keep_the_pair_in_step)
        event.listen(model, "before_update", _keep_the_pair_in_step)
