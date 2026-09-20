"""organisations become roots of the place tree

Every organisation gains a row in ``sites`` carrying its name, its
location and ``type = 'organisation'``, with no parent. Each of its sites
is then hung beneath that row, so ownership is the parent column alone
and "who is accountable for this place" is answered by walking up.

``organisations.org_unit_id`` points at that row. It is the bridge while
the organisation-only tables — features, members, patient membership —
still key on the organisation; they move across in later steps and the
column goes with the rename.

Additive only: the temporary ``sites.organisation_id`` column is dropped
by the contract migration that follows, so the two can be deployed a
release apart if need be.

Revision ID: 4036207fe698
Revises: e569c426442c
Create Date: 2026-09-16 13:22:27.620511

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4036207fe698"
down_revision: str | None = "e569c426442c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FK_NAME = "fk_organisations_org_unit_id_sites"
UQ_NAME = "uq_organisations_org_unit_id"
ROOT_TYPE = "organisation"

#: Far past anything the application builds, and low enough that a broken
#: tree fails quickly rather than looping.
MAX_TREE_DEPTH = 10


def upgrade() -> None:
    op.add_column(
        "organisations", sa.Column("org_unit_id", sa.Integer(), nullable=True)
    )
    op.create_unique_constraint(UQ_NAME, "organisations", ["org_unit_id"])
    op.create_foreign_key(
        FK_NAME,
        "organisations",
        "sites",
        ["org_unit_id"],
        ["id"],
        ondelete="SET NULL",
    )

    bind = op.get_bind()

    # One root per organisation, carrying its own name and location so the
    # tree reads correctly on its own.
    organisations = bind.execute(
        sa.text(
            "SELECT id, name, location, created_at, updated_at "
            "FROM organisations ORDER BY id"
        )
    ).all()
    for org in organisations:
        root_id = bind.execute(
            sa.text(
                "INSERT INTO sites "
                "(name, type, location, is_active, created_at, updated_at) "
                "VALUES (:name, :type, :location, true, :created, :updated) "
                "RETURNING id"
            ),
            {
                "name": org.name,
                "type": ROOT_TYPE,
                "location": org.location,
                "created": org.created_at,
                "updated": org.updated_at,
            },
        ).scalar_one()
        bind.execute(
            sa.text(
                "UPDATE organisations SET org_unit_id = :root WHERE id = :id"
            ),
            {"root": root_id, "id": org.id},
        )

    # Hang each organisation's own sites beneath its root. Only the ones
    # that have no parent already: a site nested inside another site keeps
    # the parent it has, and its root is reached through that.
    bind.execute(
        sa.text(
            "UPDATE sites SET parent_id = ("
            "  SELECT o.org_unit_id FROM organisations o"
            "  WHERE o.id = sites.organisation_id"
            ") "
            "WHERE sites.organisation_id IS NOT NULL "
            "AND sites.parent_id IS NULL "
            "AND sites.type <> :type"
        ),
        {"type": ROOT_TYPE},
    )

    _assert_every_place_reaches_a_root(bind)


def _assert_every_place_reaches_a_root(bind: sa.engine.Connection) -> None:
    """Refuse to finish while any place fails to reach a root.

    A cycle in the parent column was reachable through the API before the
    guard was written, and scoping is about to start walking this column.
    A cycle found here is a migration that refuses; found later it is a
    request that never answers.
    """
    parents = {
        row.id: row.parent_id
        for row in bind.execute(
            sa.text("SELECT id, parent_id FROM sites")
        ).all()
    }

    stranded: list[int] = []
    for site_id in parents:
        current: int | None = site_id
        for _ in range(MAX_TREE_DEPTH):
            if current is None:
                break
            if current not in parents:
                stranded.append(site_id)
                break
            current = parents[current]
        else:
            stranded.append(site_id)

    if stranded:
        raise RuntimeError(
            "These places do not reach a root, which means the parent "
            "column holds a cycle or a dangling parent: "
            + ", ".join(str(site_id) for site_id in sorted(set(stranded)))
            + ". Fix the parents before migrating."
        )


def downgrade() -> None:
    bind = op.get_bind()

    # Detach every place from its root, then remove the roots. The
    # temporary owner column still holds who owned what, so nothing about
    # ownership is lost by taking the tree back apart.
    bind.execute(
        sa.text(
            "UPDATE sites SET parent_id = NULL WHERE parent_id IN ("
            "  SELECT id FROM sites WHERE type = :type"
            ")"
        ),
        {"type": ROOT_TYPE},
    )
    bind.execute(
        sa.text("UPDATE organisations SET org_unit_id = NULL"),
    )
    bind.execute(
        sa.text("DELETE FROM sites WHERE type = :type"), {"type": ROOT_TYPE}
    )

    op.drop_constraint(  # migration-check: allow-destructive
        FK_NAME, "organisations", type_="foreignkey"
    )
    op.drop_constraint(  # migration-check: allow-destructive
        UQ_NAME, "organisations", type_="unique"
    )
    op.drop_column(  # migration-check: allow-destructive
        "organisations", "org_unit_id"
    )
