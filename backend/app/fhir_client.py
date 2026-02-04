"""
fhir_client.py

FHIR client wrapper for connecting to HAPI FHIR server.
Provides utility functions for creating and reading FHIR resources.
"""

from fhirclient import client
from fhirclient.models.address import Address
from fhirclient.models.contactpoint import ContactPoint
from fhirclient.models.fhirdate import FHIRDate
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


def update_fhir_patient(patient_id: str, demographics: dict) -> dict | None:
    """Update a FHIR Patient resource with demographics data.

    Args:
        patient_id (str): FHIR Patient resource ID.
        demographics (dict): Dictionary containing demographics fields:
            - given_name (str): First/given name
            - family_name (str): Family/last name
            - date_of_birth (str): ISO date string
            - sex (str): Gender (male|female|other|unknown)
            - address (dict): Address information
            - contact (dict): Contact information

    Returns:
        dict | None: Updated patient resource as dictionary, or None if not found.

    Raises:
        Exception: If update fails.
    """
    fhir = get_fhir_client()

    try:
        # Read existing patient
        patient = Patient.read(patient_id, fhir.server)

        # Update name if provided
        if demographics.get("given_name") or demographics.get("family_name"):
            name = HumanName()
            name.given = [demographics.get("given_name", "")]
            name.family = demographics.get("family_name", "")
            name.use = "official"
            patient.name = [name]

        # Update birth date if provided
        if demographics.get("date_of_birth"):
            patient.birthDate = FHIRDate(demographics["date_of_birth"])

        # Update gender if provided
        if demographics.get("sex"):
            # Map to FHIR gender values
            gender_map = {
                "male": "male",
                "female": "female",
                "other": "other",
                "unknown": "unknown",
            }
            patient.gender = gender_map.get(
                demographics["sex"].lower(), "unknown"
            )

        # Update address if provided
        if demographics.get("address"):
            addr = Address()
            addr_data = demographics["address"]
            if addr_data.get("line"):
                addr.line = addr_data["line"]
            if addr_data.get("city"):
                addr.city = addr_data["city"]
            if addr_data.get("state"):
                addr.state = addr_data["state"]
            if addr_data.get("postalCode"):
                addr.postalCode = addr_data["postalCode"]
            if addr_data.get("country"):
                addr.country = addr_data["country"]
            patient.address = [addr]

        # Update contact/telecom if provided
        if demographics.get("contact"):
            contact_data = demographics["contact"]
            telecoms = []

            if contact_data.get("phone"):
                phone = ContactPoint()
                phone.system = "phone"
                phone.value = contact_data["phone"]
                telecoms.append(phone)

            if contact_data.get("email"):
                email = ContactPoint()
                email.system = "email"
                email.value = contact_data["email"]
                telecoms.append(email)

            if telecoms:
                patient.telecom = telecoms

        # Save updates
        patient.update(fhir.server)

        return patient.as_json()
    except Exception:
        return None
