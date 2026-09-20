"""an organisation's place is required

Every organisation is a row in the tree as well — the root its sites
hang beneath and the thing that answers "who is accountable here". One
without that row is invisible to the whole permission system, so the
column that names it stops being nullable.

The mapper has created the row for every organisation since the tree
arrived, and the backfill gave one to those that predate it; the loop
below covers a deployment that has an organisation neither reached.

The foreign key changes from ``SET NULL`` to ``CASCADE``, which is what
a required column can accept: deleting the place an organisation *is*
deletes the organisation, because there is nothing left for it to be.

Revision ID: ce56e29bc8a6
Revises: 3b3149c593e9
Create Date: 2026-09-17 20:53:34.706621

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ce56e29bc8a6"
down_revision: str | None = "3b3149c593e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: The place type a root gets when nothing more specific is known.
#: Spelled out rather than imported from ``app.org_units.types``: a
#: migration must keep meaning what it meant when it ran.
ORGANISATION_TYPE = "organisation"


def upgrade() -> None:
    connection = op.get_bind()

    # A place for any organisation still without one, so the tightening
    # below cannot fail on live data. Row by row because each insert has
    # to hand its id back to the organisation that prompted it.
    orphans = connection.execute(
        sa.text(
            "SELECT id, name, location FROM organisations "
            "WHERE org_unit_id IS NULL"
        )
    ).all()
    for organisation_id, name, location in orphans:
        place_id = connection.execute(
            sa.text(
                "INSERT INTO org_unit "
                "(name, type, location, is_active, created_at, updated_at) "
                "VALUES (:name, :type, :location, true, now(), now()) "
                "RETURNING id"
            ),
            {"name": name, "type": ORGANISATION_TYPE, "location": location},
        ).scalar_one()
        connection.execute(
            sa.text(
                "UPDATE organisations SET org_unit_id = :place "
                "WHERE id = :organisation"
            ),
            {"place": place_id, "organisation": organisation_id},
        )

    # No server default: every row is filled, and there is no sensible
    # stand-in for a foreign key.
    op.alter_column(
        "organisations",
        "org_unit_id",
        existing_type=sa.INTEGER(),
        nullable=False,
        server_default=None,
    )

    # migration-check: allow-destructive
    # Replaced on the next line. SET NULL is what a nullable column
    # allowed; a required one cannot accept it.
    op.drop_constraint(
        "fk_organisations_org_unit_id_sites",
        "organisations",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_organisations_org_unit_id",
        "organisations",
        "org_unit",
        ["org_unit_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_organisations_org_unit_id", "organisations", type_="foreignkey"
    )
    op.create_foreign_key(
        "fk_organisations_org_unit_id_sites",
        "organisations",
        "org_unit",
        ["org_unit_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column(
        "organisations",
        "org_unit_id",
        existing_type=sa.INTEGER(),
        nullable=True,
    )
    # The places created above are left where they are. Deleting them
    # would take their members, features and patient lists with them,
    # and an organisation that has been running with a root does not
    # become one that never had it.
