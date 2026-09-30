"""rename the external assessor profession

``external_assessor`` becomes ``passport_external_assessor``, so that every
passport profession starts ``passport_`` as the teaching ones start
``teaching_``. ``users.base_profession`` is the only column that stores a
profession id.

What somebody holds is their ``user_competency`` rows, not their
profession, so the rename changes no one's access. It matters for the next
change of profession: ``change_profession`` reads the old profession's
template to decide what carries over, and an id missing from
``shared/base-professions.yaml`` has an empty template.

See ``docs/docs/plans/2026-09-30-passport-professions-plan.md``.

Revision ID: 4fd333faf33b
Revises: 16834fc0663d
Create Date: 2026-09-30 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4fd333faf33b"
down_revision: str | None = "16834fc0663d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RENAME = sa.text(
    "UPDATE users SET base_profession = :new WHERE base_profession = :old"
)


def upgrade() -> None:
    op.get_bind().execute(
        _RENAME,
        {"old": "external_assessor", "new": "passport_external_assessor"},
    )


def downgrade() -> None:
    op.get_bind().execute(
        _RENAME,
        {"old": "passport_external_assessor", "new": "external_assessor"},
    )
