"""Delete every row naming one of the five procedure permissions.

``perform_venepuncture``, ``perform_cannulation``,
``perform_lumbar_puncture``, ``perform_chest_drain`` and
``perform_advanced_airway`` leave the catalogue in the same pull request,
at the product owner's request on 4 November 2026: a permission names
something Quill lets a person do, and Quill cannot stop anybody performing
a procedure. No code checked any of them. A row naming an id the catalogue
no longer holds points at nothing, so the rows go too: who holds one, in
``user_competency``, and where they may practise it, in
``practising_competency``.

A position whose holder must hold one of the five is a requirement
somebody chose, so this refuses to run rather than clear it, and the
deploy stops until a person decides what that post requires instead.

See Phase 13 of
docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.

Revision ID: f2e9632b4716
Revises: cd66a15967e7
Create Date: 2026-11-04 17:00:00.000000

"""

import logging
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2e9632b4716"
down_revision: str | None = "cd66a15967e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: The five permissions that name a procedure.
PROCEDURE_PERMISSIONS = (
    "perform_venepuncture",
    "perform_cannulation",
    "perform_lumbar_puncture",
    "perform_chest_drain",
    "perform_advanced_airway",
)


def _ids() -> sa.BindParameter[list[str]]:
    """The five ids, as one parameter a statement's IN can expand."""
    return sa.bindparam("ids", list(PROCEDURE_PERMISSIONS), expanding=True)


def upgrade() -> None:
    bind = op.get_bind()

    required = bind.execute(
        sa.text(
            "SELECT count(*) FROM position "
            "WHERE requires_competency IN :ids"
        ).bindparams(_ids())
    ).scalar_one()

    if required:
        raise RuntimeError(
            f"{required} position(s) require a procedure permission that is "
            "being deleted. Decide what each post requires instead, then "
            "run the migrations again."
        )

    bind.execute(
        sa.text(
            "DELETE FROM practising_competency WHERE competency IN :ids"
        ).bindparams(_ids())
    )
    bind.execute(
        sa.text(
            "DELETE FROM user_competency WHERE competency_id IN :ids"
        ).bindparams(_ids())
    )


def downgrade() -> None:
    # The rows cannot be put back: nothing kept who held each permission,
    # who granted it or where it was practised. Refusing would stop every
    # rollback past this point, and the older code needs none of them: it
    # reads a catalogue holding the five, and finds nobody holding them.
    # So the downgrade says so to whoever runs it, and changes nothing.
    logging.getLogger("alembic.runtime.migration").warning(
        "f2e9632b4716: the rows naming the five procedure permissions were "
        "deleted and are not restored. Grant them again by hand if needed."
    )
