"""
Backfill script to add gradient index extensions to existing patients.

This script:
1. Fetches all patients from the FHIR server
2. Generates a random gradient index for each patient
3. Adds the gradient index extension to the patient
4. Updates the patient in FHIR

Run with:
    cd backend
    poetry run python scripts/backfill_gradient_indices.py
"""

from fhirclient.models.patient import Patient

from app.fhir_client import (
    add_avatar_gradient_extension,
    get_fhir_client,
    list_fhir_patients,
)
from app.utils.colors import generate_avatar_gradient_index


def backfill_gradient_indices():
    """Add gradient index extensions to all existing patients."""
    print("Fetching all patients from FHIR server...")
    patients = list_fhir_patients()
    total_patients = len(patients)
    print(f"Found {total_patients} patients")

    if total_patients == 0:
        print("No patients to update")
        return

    fhir = get_fhir_client()
    updated_count = 0
    skipped_count = 0

    for i, patient_dict in enumerate(patients, 1):
        patient_id = patient_dict.get("id")
        patient_name = "Unknown"

        # Extract patient name for logging
        if patient_dict.get("name"):
            name_obj = patient_dict["name"][0]
            given = " ".join(name_obj.get("given", []))
            family = name_obj.get("family", "")
            patient_name = f"{given} {family}".strip()

        print(
            f"\n[{i}/{total_patients}] Processing: {patient_name} (ID: {patient_id})"
        )

        # Check if patient already has gradient index extension (new format)
        extensions = patient_dict.get("extension", [])
        has_gradient_index = False
        for ext in extensions:
            if ext.get("url") == "urn:quillmedical:avatar-gradient":
                # Check if it has valueInteger (new format), not nested extension (old format)
                if "valueInteger" in ext:
                    has_gradient_index = True
                    break

        if has_gradient_index:
            print("  ⏭️  Skipping - already has gradient index")
            skipped_count += 1
            continue

        # Convert dict to Patient object
        patient = Patient(patient_dict)

        # Remove old gradient extension if it exists (legacy format with colorFrom/colorTo)
        if patient.extension:
            patient.extension = [
                ext
                for ext in patient.extension
                if ext.url != "urn:quillmedical:avatar-gradient"
            ]

        # Generate random gradient index
        gradient_index = generate_avatar_gradient_index()
        print(f"  🎨 Assigning gradient index: {gradient_index}")

        # Add gradient index extension
        add_avatar_gradient_extension(patient, gradient_index)

        # Update patient in FHIR
        try:
            # Use PUT to update the patient
            patient.id = patient_id
            patient.update(fhir.server)
            print("  ✅ Updated successfully")
            updated_count += 1
        except Exception as e:
            print(f"  ❌ Error updating patient: {e}")
            continue

    print("\n" + "=" * 60)
    print("Backfill complete!")
    print(f"  Updated: {updated_count}")
    print(f"  Skipped: {skipped_count}")
    print(f"  Total:   {total_patients}")
    print("=" * 60)


if __name__ == "__main__":
    backfill_gradient_indices()
