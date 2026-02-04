#!/usr/bin/env python3
"""Add test patients to FHIR server with full demographics."""

import os

from fhirclient import client
from fhirclient.models.codeableconcept import CodeableConcept
from fhirclient.models.coding import Coding
from fhirclient.models.fhirdate import FHIRDate
from fhirclient.models.humanname import HumanName
from fhirclient.models.identifier import Identifier
from fhirclient.models.patient import Patient

# FHIR server URL
FHIR_URL = os.getenv("FHIR_SERVER_URL", "http://localhost/api/fhir")


def create_fhir_client():
    """Create FHIR client."""
    settings = {"app_id": "quill_backend", "api_base": FHIR_URL}
    return client.FHIRClient(settings=settings)


def create_patient(family, given, birth_date, gender, nhs_number):
    """Create a patient resource."""
    patient = Patient()

    # Name
    name = HumanName()
    name.family = family
    name.given = [given]
    patient.name = [name]

    # Birth date
    patient.birthDate = FHIRDate(birth_date)

    # Gender
    patient.gender = gender

    # NHS number identifier
    identifier = Identifier()
    identifier.system = "https://fhir.nhs.uk/Id/nhs-number"
    identifier.value = nhs_number
    identifier_type = CodeableConcept()
    coding = Coding()
    coding.system = "http://terminology.hl7.org/CodeSystem/v2-0203"
    coding.code = "NH"
    coding.display = "National Health Number"
    identifier_type.coding = [coding]
    identifier.type = identifier_type
    patient.identifier = [identifier]

    return patient


def main():
    """Add test patients."""
    fhir_client = create_fhir_client()

    # Test patients with demographics
    patients = [
        ("Smith", "John", "1985-03-15", "male", "9876543210"),
        ("Johnson", "Emma", "1990-07-22", "female", "9876543211"),
        ("Williams", "James", "1978-11-30", "male", "9876543212"),
        ("Brown", "Sarah", "1995-05-10", "female", "9876543213"),
        ("Jones", "Michael", "1982-09-18", "male", "9876543214"),
    ]

    for family, given, birth_date, gender, nhs_number in patients:
        patient = create_patient(family, given, birth_date, gender, nhs_number)
        result = patient.create(fhir_client.server)
        if result:
            print(f"✓ Created: {given} {family} (NHS: {nhs_number})")
        else:
            print(f"✗ Failed: {given} {family}")

    print("\nDone! All test patients created.")


if __name__ == "__main__":
    main()
