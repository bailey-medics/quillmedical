"""give a site one owning organisation

Ownership moves off the many-to-many ``organisation_site`` table and onto a
single ``sites.organisation_id`` column, so that "whose features apply
here", "who is the clinical lead" and "which admins may edit this" each
have one answer rather than a set of them.

The column is nullable because the rows already in the table have no value
yet; the backfill below gives every linked site one. A site that is linked
to more than one organisation cannot be backfilled without guessing, so
this migration refuses and names the sites instead. In practice there are
none — every link row in every seed and test points at exactly one
organisation — so the check proves itself rather than resolving anything.

Revision ID: 09b1d53782d3
Revises: 618a413e034e
Create Date: 2026-09-16 13:07:55.350313

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "09b1d53782d3"
down_revision: str | None = "618a413e034e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FK_NAME = "fk_sites_organisation_id_organisations"


def upgrade() -> None:
    op.add_column(
        "sites", sa.Column("organisation_id", sa.Integer(), nullable=True)
    )
    op.create_index(
        op.f("ix_sites_organisation_id"),
        "sites",
        ["organisation_id"],
        unique=False,
    )
    op.create_foreign_key(
        FK_NAME,
        "sites",
        "organisations",
        ["organisation_id"],
        ["id"],
        ondelete="CASCADE",
    )

    bind = op.get_bind()

    # Refuse rather than guess. Picking one of two owners silently would
    # hand a site's admin rights and feature set to whichever organisation
    # happened to sort first.
    shared = (
        bind.execute(
            sa.text(
                "SELECT site_id FROM organisation_site "
                "GROUP BY site_id HAVING COUNT(*) > 1 ORDER BY site_id"
            )
        )
        .scalars()
        .all()
    )
    if shared:
        raise RuntimeError(
            "These sites belong to more than one organisation and cannot be "
            "given a single owner automatically: "
            + ", ".join(str(site_id) for site_id in shared)
            + ". Decide which organisation owns each one, remove the other "
            "link rows, and run this migration again."
        )

    bind.execute(
        sa.text(
            "UPDATE sites SET organisation_id = ("
            "  SELECT organisation_id FROM organisation_site"
            "  WHERE organisation_site.site_id = sites.id"
            ")"
        )
    )


def downgrade() -> None:
    # The link table was never emptied, so dropping the column loses
    # nothing: every value in it came from a row that is still there.
    op.drop_constraint(  # migration-check: allow-destructive
        FK_NAME, "sites", type_="foreignkey"
    )
    op.drop_index(op.f("ix_sites_organisation_id"), table_name="sites")
    op.drop_column(  # migration-check: allow-destructive
        "sites", "organisation_id"
    )
