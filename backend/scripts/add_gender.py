#!/usr/bin/env python3
"""Add gender to existing FHIR patients."""

import sys
from pathlib import Path

# Add the parent directory to the path so we can import app
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.fhir_client import get_fhir_client


def add_gender_to_patients():
    """Add gender field to all patients."""
    client = get_fhir_client()

    # Patient data with genders
    patients_data = [
        {"id": "1000", "name": "Alice Johnson", "gender": "female"},
        {"id": "1001", "name": "Bob Smith", "gender": "male"},
        {"id": "1002", "name": "Carol Williams", "gender": "female"},
        {"id": "1003", "name": "David Brown", "gender": "male"},
        {"id": "1004", "name": "Emma Davis", "gender": "female"},
    ]

    for patient_data in patients_data:
        # Read existing patient
        from fhirclient.models.patient import Patient

        patient = Patient.read(patient_data["id"], client.server)

        # Add gender
        patient.gender = patient_data["gender"]

        # Update patient
        patient.update(client.server)
        print(
            f"Updated {patient_data['name']} with gender: {patient_data['gender']}"
        )


if __name__ == "__main__":
    add_gender_to_patients()
    print("\nAll patients updated with gender!")
