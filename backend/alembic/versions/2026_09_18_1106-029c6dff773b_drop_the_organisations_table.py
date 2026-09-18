"""drop the organisations table

An organisation is a place at the top of a tree. It has been one since
the roots were created, and nothing has read this table for its own id
since the surfaces stopped translating: its name, its type and the fact
that it is an organisation are all properties of ``org_unit``.

The last thing it was load-bearing for was the number media is filed
under in the bucket, and ``org_unit.media_prefix_id`` records that now,
so no object moves and no cookie is reissued.

``module_media_link.organisation_id`` keeps its value and loses its
foreign key. It is an address rather than a reference: the number stays
valid whether or not anything else still knows it.

Revision ID: 029c6dff773b
Revises: 7ba791482ca6
Create Date: 2026-09-18 11:06:22.418733

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "029c6dff773b"
down_revision: str | None = "7ba791482ca6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: The place types a tree starts with, as ``shared/org-unit-types.yaml``
#: had them when this ran. Spelled out rather than imported: a migration
#: must keep meaning what it meant on the day.
ROOT_TYPES = (
    "organisation",
    "hospital_team",
    "gp_practice",
    "private_clinic",
    "teaching_establishment",
)


def upgrade() -> None:
    # migration-check: allow-destructive
    # The foreign key first: the column it hangs off stays, because it
    # is where a media object sits in the bucket rather than a reference
    # to a row.
    op.drop_constraint(
        "module_media_link_organisation_id_fkey",
        "module_media_link",
        type_="foreignkey",
    )
    # migration-check: allow-destructive
    op.drop_index("ix_organisations_name", table_name="organisations")
    # migration-check: allow-destructive
    # Everything this table said is said by ``org_unit``: the name, the
    # type, and — through the type — that the place is an organisation.
    op.drop_table("organisations")


def downgrade() -> None:
    op.create_table(
        "organisations",
        sa.Column("id", sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column("name", sa.VARCHAR(length=255), nullable=False),
        sa.Column("type", sa.VARCHAR(length=50), nullable=False),
        sa.Column("location", sa.VARCHAR(length=500), nullable=True),
        sa.Column(
            "created_at", postgresql.TIMESTAMP(timezone=True), nullable=False
        ),
        sa.Column(
            "updated_at", postgresql.TIMESTAMP(timezone=True), nullable=False
        ),
        sa.Column("org_unit_id", sa.INTEGER(), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_unit_id"],
            ["org_unit.id"],
            name="fk_organisations_org_unit_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="organisations_pkey"),
        sa.UniqueConstraint(
            "org_unit_id", name="uq_organisations_org_unit_id"
        ),
    )

    # One row back for every place that is an organisation, under the id
    # it had before: the media prefix where one was recorded, and the
    # place's own id where the two already agreed. Anything less would
    # leave ``module_media_link.organisation_id`` naming a row that is
    # not there, and the foreign key below would refuse.
    op.execute(
        sa.text(
            "INSERT INTO organisations "
            "(id, name, type, location, created_at, updated_at, org_unit_id) "
            "SELECT COALESCE(media_prefix_id, id), name, type, location, "
            "created_at, updated_at, id FROM org_unit "
            "WHERE type IN :root_types"
        ).bindparams(
            sa.bindparam("root_types", list(ROOT_TYPES), expanding=True)
        )
    )
    # The sequence starts above what was just inserted, so the next
    # organisation created does not collide with one of them.
    op.execute(
        sa.text(
            "SELECT setval('organisations_id_seq', "
            "COALESCE((SELECT MAX(id) FROM organisations), 1))"
        )
    )

    op.create_index(
        "ix_organisations_name", "organisations", ["name"], unique=False
    )
    op.create_foreign_key(
        "module_media_link_organisation_id_fkey",
        "module_media_link",
        "organisations",
        ["organisation_id"],
        ["id"],
        ondelete="CASCADE",
    )
