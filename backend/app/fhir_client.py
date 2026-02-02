"""
fhir_client.py

FHIR client wrapper for connecting to HAPI FHIR server.
Provides utility functions for creating and reading FHIR resources.
"""

from fhirclient import client
from fhirclient.models.humanname import HumanName
from fhirclient.models.patient import Patient

from app.config import settings


def get_fhir_client() -> client.FHIRClient:
    """Get configured FHIR client instance.

    Returns:
        FHIRClient: Configured client connected to HAPI FHIR server.
    """
    fhir_settings = {
        "app_id": "quill_medical",
        "api_base": settings.FHIR_SERVER_URL,
    }
    return client.FHIRClient(settings=fhir_settings)


def create_fhir_patient(
    given_name: str, family_name: str, patient_id: str | None = None
) -> dict:
    """Create a new FHIR Patient resource.

    Args:
        given_name (str): Patient's first/given name.
        family_name (str): Patient's family/last name.
        patient_id (str | None): Optional ID for the patient.

    Returns:
        dict: Created patient resource as dictionary.

    Raises:
        Exception: If creation fails.
    """
    fhir = get_fhir_client()

    # Create Patient resource
    patient = Patient()
    if patient_id:
        patient.id = patient_id

    # Create name
    name = HumanName()
    name.given = [given_name]
    name.family = family_name
    name.use = "official"

    patient.name = [name]

    # Save to FHIR server
    patient.create(fhir.server)

    # Return as dict
    return patient.as_json()


def read_fhir_patient(patient_id: str) -> dict | None:
    """Read a FHIR Patient resource by ID.

    Args:
        patient_id (str): FHIR Patient resource ID.

    Returns:
        dict | None: Patient resource as dictionary, or None if not found.
    """
    fhir = get_fhir_client()

    try:
        patient = Patient.read(patient_id, fhir.server)
        return patient.as_json()
    except Exception:
        return None


def list_fhir_patients() -> list[dict]:
    """List all FHIR Patient resources.

    Returns:
        list[dict]: List of patient resources as dictionaries.
    """
    fhir = get_fhir_client()

    try:
        # Search for all patients
        search = Patient.where(struct={})
        patients = search.perform_resources(fhir.server)
        return [p.as_json() for p in patients]
    except Exception:
        return []
