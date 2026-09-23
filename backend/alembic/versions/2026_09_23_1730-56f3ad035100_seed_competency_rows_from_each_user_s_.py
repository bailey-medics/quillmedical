"""seed competency rows from each user's base profession

Writes a `user_competency` row, `source` `profession`, for every
competency each user's base profession grants, unless they already hold
it through a current grant row or have it removed through a current
removal row. Removed means not held, so nothing is seeded for it.

The step before letting the profession go: once these rows exist, what
somebody holds can be read from their rows alone, and an edit to
`shared/base-professions.yaml` stops changing people who already have
the profession. The resolver still adds the template on top of the rows
until a later change, so nobody's competencies change here.

The application has seeded rows for anybody given a profession since the
change before this one, so the table is not empty for them, and every
insert skips what is already there.

**The templates are frozen here as literals**, copied from
`shared/base-professions.yaml` when this was written. A migration cannot
read the file: it moves on, and this has to go on meaning what it meant.
A profession missing from `TEMPLATES` seeds nothing for its holders.

Written by hand: there is no model change for `just migrate` to find.

Revision ID: 56f3ad035100
Revises: 113dbf80612e
Create Date: 2026-09-23 17:30:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "56f3ad035100"
down_revision: str | None = "113dbf80612e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Each base profession's `base_competencies` when this was written.
TEMPLATES: dict[str, tuple[str, ...]] = {
    "patient": ("access_own_patient_records",),
    "foundation_year_1": (
        "access_patient_records",
        "assess_clinician_passport",
        "certify_fitness_to_work",
        "modify_patient_records",
        "perform_cannulation",
        "perform_venepuncture",
        "prescribe_non_controlled",
        "refer_specialty",
        "request_plain_xray",
        "take_informed_consent",
    ),
    "foundation_year_2": (
        "access_patient_records",
        "admit_patient",
        "assess_clinician_passport",
        "certify_death",
        "certify_fitness_to_work",
        "modify_patient_records",
        "perform_cannulation",
        "perform_venepuncture",
        "prescribe_controlled_schedule_3_4_5",
        "prescribe_non_controlled",
        "refer_specialty",
        "request_ct_scan",
        "request_mri_scan",
        "request_plain_xray",
        "take_informed_consent",
    ),
    "specialty_trainee_1_2": (
        "access_patient_records",
        "admit_patient",
        "assess_clinician_passport",
        "assess_mental_capacity",
        "certify_death",
        "certify_fitness_to_drive",
        "certify_fitness_to_work",
        "interpret_ecg",
        "modify_patient_records",
        "perform_cannulation",
        "perform_venepuncture",
        "prescribe_controlled_schedule_3_4_5",
        "prescribe_non_controlled",
        "refer_specialty",
        "request_ct_scan",
        "request_mri_scan",
        "request_plain_xray",
        "take_informed_consent",
    ),
    "specialty_trainee_3_plus": (
        "access_patient_records",
        "admit_patient",
        "approve_clinical_letters",
        "assess_clinician_passport",
        "assess_mental_capacity",
        "certify_death",
        "certify_fitness_to_drive",
        "certify_fitness_to_work",
        "discharge_without_review",
        "interpret_ecg",
        "manage_anticoagulation",
        "manage_diabetes",
        "modify_patient_records",
        "perform_cannulation",
        "perform_lumbar_puncture",
        "perform_venepuncture",
        "prescribe_controlled_schedule_2",
        "prescribe_controlled_schedule_3_4_5",
        "prescribe_non_controlled",
        "refer_specialty",
        "request_ct_scan",
        "request_mri_scan",
        "request_plain_xray",
        "take_informed_consent",
    ),
    "consultant": (
        "access_patient_records",
        "admit_patient",
        "apply_deprivation_of_liberty",
        "approve_clinical_letters",
        "assess_clinician_passport",
        "assess_mental_capacity",
        "certify_cremation",
        "certify_death",
        "certify_fitness_to_drive",
        "certify_fitness_to_work",
        "discharge_without_review",
        "interpret_ecg",
        "manage_anticoagulation",
        "manage_diabetes",
        "modify_patient_records",
        "perform_advanced_airway",
        "perform_cannulation",
        "perform_chest_drain",
        "perform_lumbar_puncture",
        "perform_venepuncture",
        "prescribe_controlled_schedule_2",
        "prescribe_controlled_schedule_3_4_5",
        "prescribe_non_controlled",
        "refer_specialty",
        "request_ct_scan",
        "request_mri_scan",
        "request_plain_xray",
        "take_informed_consent",
    ),
    "general_practitioner": (
        "access_patient_records",
        "approve_clinical_letters",
        "assess_clinician_passport",
        "assess_mental_capacity",
        "certify_death",
        "certify_fitness_to_drive",
        "certify_fitness_to_work",
        "interpret_ecg",
        "modify_patient_records",
        "perform_cannulation",
        "perform_venepuncture",
        "prescribe_controlled_schedule_2",
        "prescribe_controlled_schedule_3_4_5",
        "prescribe_non_controlled",
        "refer_specialty",
        "request_ct_scan",
        "request_mri_scan",
        "request_plain_xray",
        "take_informed_consent",
    ),
    "registered_nurse": (
        "access_patient_records",
        "assess_clinician_passport",
        "certify_fitness_to_work",
        "modify_patient_records",
        "perform_cannulation",
        "perform_venepuncture",
        "refer_specialty",
        "take_informed_consent",
    ),
    "advanced_nurse_practitioner": (
        "access_patient_records",
        "approve_clinical_letters",
        "assess_clinician_passport",
        "assess_mental_capacity",
        "certify_fitness_to_work",
        "modify_patient_records",
        "perform_cannulation",
        "perform_venepuncture",
        "prescribe_controlled_schedule_3_4_5",
        "prescribe_non_controlled",
        "refer_specialty",
        "request_plain_xray",
        "take_informed_consent",
    ),
    "healthcare_assistant": (
        "access_patient_records",
        "assess_clinician_passport",
        "perform_venepuncture",
    ),
    "pharmacist": (
        "access_patient_records",
        "assess_clinician_passport",
        "certify_fitness_to_work",
        "modify_patient_records",
        "prescribe_controlled_schedule_3_4_5",
        "prescribe_non_controlled",
    ),
    "pharmacy_technician": (
        "access_patient_records",
        "assess_clinician_passport",
    ),
    "physiotherapist": (
        "access_patient_records",
        "assess_clinician_passport",
        "certify_fitness_to_work",
        "modify_patient_records",
        "refer_specialty",
        "request_plain_xray",
        "take_informed_consent",
    ),
    "occupational_therapist": (
        "access_patient_records",
        "assess_clinician_passport",
        "modify_patient_records",
        "refer_specialty",
        "take_informed_consent",
    ),
    "paramedic": (
        "access_patient_records",
        "assess_clinician_passport",
        "certify_fitness_to_work",
        "modify_patient_records",
        "perform_cannulation",
        "perform_venepuncture",
        "prescribe_non_controlled",
        "refer_specialty",
        "take_informed_consent",
    ),
    "medical_secretary": (
        "access_clinic_admin",
        "access_patient_records",
    ),
    "receptionist": ("access_clinic_admin",),
    "clinic_manager": (
        "access_clinic_admin",
        "access_patient_records",
        "manage_practising_competencies",
        "manage_staff_membership",
        "manage_users",
    ),
    "patient_manager": ("manage_patient_membership",),
    "system_administrator": (
        "access_clinic_admin",
        "access_patient_records",
        "manage_practising_competencies",
        "manage_staff_membership",
        "manage_users",
    ),
    "superadmin_profession": (
        "manage_practising_competencies",
        "manage_staff_membership",
        "manage_users",
    ),
    "teaching_delegate": ("view_teaching_cases",),
    "teaching_clinical_lead": ("view_teaching_cases",),
    "teaching_admin": (
        "manage_teaching_content",
        "view_teaching_analytics",
        "view_teaching_cases",
    ),
    "teaching_manager": (
        "manage_practising_competencies",
        "manage_staff_membership",
        "manage_teaching_content",
        "manage_users",
        "view_teaching_analytics",
        "view_teaching_cases",
    ),
    "patient_advocate": ("access_granted_patient_records",),
    "external_hcp": ("access_granted_patient_records",),
    "external_assessor": ("assess_clinician_passport",),
}


def _templates_sql() -> str:
    """`TEMPLATES` as a `VALUES` list of (profession, competency) rows."""
    return ",\n".join(
        f"('{profession}', '{competency_id}')"
        for profession, competencies in TEMPLATES.items()
        for competency_id in competencies
    )


def _seed() -> str:
    """Seed each user's template competencies, skipping what is there.

    `starts_on` is null because nothing recorded when somebody was given
    their profession. That also marks these rows: every row the
    application seeds carries the moment it was written.
    """
    return f"""
        INSERT INTO user_competency
            (user_id, competency_id, granted, starts_on, ends_on,
             source, org_unit_id, granted_by, created_at)
        SELECT u.id,
               t.competency_id,
               true,
               CAST(NULL AS timestamptz),
               CAST(NULL AS timestamptz),
               'profession',
               CAST(NULL AS integer),
               CAST(NULL AS integer),
               NOW()
          FROM users u
          JOIN (VALUES {_templates_sql()})
               AS t(profession, competency_id)
            ON t.profession = u.base_profession
         WHERE NOT EXISTS (
                   SELECT 1
                     FROM user_competency existing
                    WHERE existing.user_id = u.id
                      AND existing.competency_id = t.competency_id
                      AND (existing.ends_on IS NULL
                           OR existing.ends_on > NOW())
               )
    """


def upgrade() -> None:
    """Seed every user's profession competencies as rows.

    Idempotent: a current row of either kind for the competency, a grant
    or a removal, skips it, so re-running adds nothing.
    """
    op.execute(_seed())


def downgrade() -> None:
    """Remove only the rows this migration wrote.

    `source` `profession` with a null `starts_on` and a null `granted_by`
    is exactly what `upgrade` writes. A row the application seeded carries
    the moment it was written, so it survives.
    """
    op.execute("""
        DELETE FROM user_competency
         WHERE source = 'profession'
           AND starts_on IS NULL
           AND granted_by IS NULL
    """)
