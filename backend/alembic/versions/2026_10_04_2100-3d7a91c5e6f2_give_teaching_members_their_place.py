"""give teaching members their place

Teaching now asks *where* somebody may take modules: a
`practising_competency` row for `take_teaching_modules` at an org unit
they belong to. Until this, belonging anywhere under a teaching
organisation was enough. See
`docs/docs/plans/2026-10-04-teaching-access-results-modules-and-enrolment-plan.md`.

So nobody loses their way in, write that row at every org unit each
current holder of `take_teaching_modules` is a member of, unless one is
there. That is exactly what membership gave them before: every one of
their org units reached its organisation's modules, and each still does.
A row at an org unit whose organisation serves no module opens nothing,
as the membership opened nothing.

First, though, the delegates who registered themselves. Registration
built the account before naming its profession, and the competency rows
are written when the account is built, so each got a patient's rows and
none from teaching. They are found by having a teaching profession and no
row, current or closed, for any teaching learner competency: somebody an
administrator took it from has a closed row and is left alone. Each is
given both, with `source` `profession`, as the constructor would have.

`authorised_by` is left empty: no person made these decisions. The row
is there because the membership was.

Written by hand: there is no model change for `just migrate` to find,
and the recipe refuses an empty revision.

Revision ID: 3d7a91c5e6f2
Revises: 7d0086c2b783
Create Date: 2026-10-04 21:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3d7a91c5e6f2"
down_revision: str | None = "7d0086c2b783"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Frozen here as literals: a migration cannot read the catalogue.
RESULTS = "view_teaching_results"
MODULES = "take_teaching_modules"
RETIRED = "view_teaching_cases"

#: The professions that carry both, when this was written.
TEACHING_PROFESSIONS = (
    "teaching_delegate",
    "teaching_clinical_lead",
    "teaching_admin",
)


def _seed_never_seeded() -> None:
    """Give both competencies to teaching accounts that never had a row.

    One statement writes both rows, so the test for "never had one" is
    made once, before either is written.
    """
    professions = ", ".join(f"'{p}'" for p in TEACHING_PROFESSIONS)
    op.execute(f"""
        INSERT INTO user_competency
            (user_id, competency_id, starts_on, source, created_at)
        SELECT u.id, new.competency_id, now(), 'profession', now()
          FROM users AS u
         CROSS JOIN (VALUES ('{RESULTS}'), ('{MODULES}'))
               AS new (competency_id)
         WHERE u.base_profession IN ({professions})
           AND NOT EXISTS (
               SELECT 1 FROM user_competency AS ever
                WHERE ever.user_id = u.id
                  AND ever.competency_id IN
                      ('{RESULTS}', '{MODULES}', '{RETIRED}')
           )
    """)


def upgrade() -> None:
    """Seed the never-seeded, then write a place row for each holder."""
    _seed_never_seeded()
    op.execute(f"""
        INSERT INTO practising_competency
            (user_id, org_unit_id, competency, authorised_by,
             authorised_at)
        SELECT m.user_id, m.org_unit_id, '{MODULES}', NULL, now()
          FROM org_unit_member AS m
         WHERE EXISTS (
               SELECT 1 FROM user_competency AS held
                WHERE held.user_id = m.user_id
                  AND held.competency_id = '{MODULES}'
                  AND (held.ends_on IS NULL OR held.ends_on > now())
           )
           AND NOT EXISTS (
               SELECT 1 FROM practising_competency AS already
                WHERE already.user_id = m.user_id
                  AND already.org_unit_id = m.org_unit_id
                  AND already.competency = '{MODULES}'
           )
    """)


def downgrade() -> None:
    """Remove the rows nobody authorised.

    The rows this wrote cannot be told from one written when somebody
    registered through a centre's link: both have no `authorised_by`.
    Both go. The code being stepped back to reads neither, and a row an
    administrator authorised by hand is left alone.

    The competencies seeded for self-registered delegates stay. They
    should always have had them, and the migration below this one moves
    them back to the retired competency on its own way down.
    """
    # migration-check: allow-destructive
    op.execute(f"""
        DELETE FROM practising_competency
         WHERE competency = '{MODULES}'
           AND authorised_by IS NULL
    """)
