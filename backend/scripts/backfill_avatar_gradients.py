"""
Backfill avatar gradient colors for existing patients.

This script adds avatar gradient color extensions to existing FHIR Patient
resources that don't have them. Useful for migrating legacy data.

Usage:
    cd backend
    poetry run python scripts/backfill_avatar_gradients.py
"""

import sys
from pathlib import Path

# Add backend app to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fhirclient.models.patient import Patient

from app.fhir_client import (
    AVATAR_GRADIENT_EXTENSION_URL,
    add_avatar_gradient_extension,
    get_fhir_client,
    list_fhir_patients,
)


def backfill_avatar_gradients(dry_run: bool = True) -> None:
    """
    Backfill avatar gradient colors for patients missing them.

    Args:
        dry_run: If True, only reports what would be updated. If False, actually updates.
    """
    print(
        f"{'[DRY RUN] ' if dry_run else ''}Starting avatar gradient backfill..."
    )

    # Get FHIR client
    fhir = get_fhir_client()

    # List all patients
    patients_data = list_fhir_patients()
    print(f"Found {len(patients_data)} patients")

    updated_count = 0
    skipped_count = 0

    for patient_dict in patients_data:
        patient_id = patient_dict.get("id")

        # Check if patient already has avatar gradient extension
        extensions = patient_dict.get("extension", [])
        has_gradient = any(
            ext.get("url") == AVATAR_GRADIENT_EXTENSION_URL
            for ext in extensions
        )

        if has_gradient:
            print(f"  Skipping patient {patient_id} (already has gradient)")
            skipped_count += 1
            continue

        # Patient needs gradient colors
        print(
            f"  {'Would update' if dry_run else 'Updating'} patient {patient_id}..."
        )

        if not dry_run:
            try:
                # Read patient resource
                patient = Patient.read(patient_id, fhir.server)

                # Add gradient extension
                add_avatar_gradient_extension(patient)

                # Log the gradient colors for debugging
                if patient.extension:
                    for ext in patient.extension:
                        if ext.url == AVATAR_GRADIENT_EXTENSION_URL:
                            colors = {
                                e.url: e.valueString
                                for e in ext.extension
                                if hasattr(e, "valueString")
                            }
                            print(f"    Generated: {colors}")

                # Update patient
                patient.update(fhir.server)

                print(f"    ✓ Updated patient {patient_id}")
                updated_count += 1
            except Exception as e:
                print(f"    ✗ Failed to update patient {patient_id}: {e}")
        else:
            updated_count += 1

    print("\n" + "=" * 60)
    print(f"{'[DRY RUN] ' if dry_run else ''}Backfill complete!")
    print(
        f"  Patients {'that would be' if dry_run else ''} updated: {updated_count}"
    )
    print(f"  Patients skipped (already have gradients): {skipped_count}")
    print(f"  Total patients: {len(patients_data)}")

    if dry_run:
        print("\nTo actually update patients, run:")
        print("  python scripts/backfill_avatar_gradients.py --apply")


if __name__ == "__main__":
    # Check for --apply flag
    apply = "--apply" in sys.argv
    auto_confirm = "--yes" in sys.argv or "-y" in sys.argv

    if apply:
        if not auto_confirm:
            confirm = input(
                "Are you sure you want to update all patients? (yes/no): "
            )
            if confirm.lower() != "yes":
                print("Aborted.")
                sys.exit(0)
        backfill_avatar_gradients(dry_run=False)
    else:
        backfill_avatar_gradients(dry_run=True)
