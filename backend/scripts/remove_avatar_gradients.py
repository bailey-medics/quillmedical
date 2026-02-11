"""
Remove avatar gradient extensions from all patients.

This script removes avatar gradient color extensions from all FHIR Patient
resources. Useful for testing the backfill script.

Usage:
    docker exec quill_backend python scripts/remove_avatar_gradients.py --yes
"""

import sys
from pathlib import Path

# Add backend app to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fhirclient.models.patient import Patient

from app.fhir_client import (
    AVATAR_GRADIENT_EXTENSION_URL,
    get_fhir_client,
    list_fhir_patients,
)


def remove_avatar_gradients(dry_run: bool = True) -> None:
    """
    Remove avatar gradient colors from all patients.

    Args:
        dry_run: If True, only reports what would be removed. If False, actually removes.
    """
    print(f"{'[DRY RUN] ' if dry_run else ''}Starting avatar gradient removal...")

    # Get FHIR client
    fhir = get_fhir_client()

    # List all patients
    patients_data = list_fhir_patients()
    print(f"Found {len(patients_data)} patients")

    removed_count = 0
    skipped_count = 0

    for patient_dict in patients_data:
        patient_id = patient_dict.get("id")

        # Check if patient has avatar gradient extension
        extensions = patient_dict.get("extension", [])
        has_gradient = any(
            ext.get("url") == AVATAR_GRADIENT_EXTENSION_URL for ext in extensions
        )

        if not has_gradient:
            print(f"  Skipping patient {patient_id} (no gradient)")
            skipped_count += 1
            continue

        # Patient has gradient - remove it
        print(
            f"  {'Would remove from' if dry_run else 'Removing from'} patient {patient_id}..."
        )

        if not dry_run:
            try:
                # Read patient resource
                patient = Patient.read(patient_id, fhir.server)

                # Remove gradient extension
                if patient.extension:
                    patient.extension = [
                        ext
                        for ext in patient.extension
                        if ext.url != AVATAR_GRADIENT_EXTENSION_URL
                    ]

                # Update patient
                patient.update(fhir.server)

                print(f"    ✓ Removed from patient {patient_id}")
                removed_count += 1
            except Exception as e:
                print(f"    ✗ Failed to update patient {patient_id}: {e}")
        else:
            removed_count += 1

    print("\n" + "=" * 60)
    print(f"{'[DRY RUN] ' if dry_run else ''}Removal complete!")
    print(f"  Patients {'that would be' if dry_run else ''} updated: {removed_count}")
    print(f"  Patients skipped (no gradients): {skipped_count}")
    print(f"  Total patients: {len(patients_data)}")

    if dry_run:
        print("\nTo actually remove gradients, run:")
        print("  python scripts/remove_avatar_gradients.py --yes")


if __name__ == "__main__":
    # Check for --yes flag
    apply = "--yes" in sys.argv or "-y" in sys.argv

    if apply:
        remove_avatar_gradients(dry_run=False)
    else:
        remove_avatar_gradients(dry_run=True)
