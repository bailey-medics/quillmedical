"""
fhir_client.py

FHIR client wrapper for connecting to HAPI FHIR server.
Provides utility functions for creating and reading FHIR resources.
"""

import uuid

from fhirclient import client
from fhirclient.models.address import Address
from fhirclient.models.contactpoint import ContactPoint
from fhirclient.models.extension import Extension
from fhirclient.models.fhirdate import FHIRDate
from fhirclient.models.humanname import HumanName
from fhirclient.models.patient import Patient

from app.config import settings
from app.utils.colors import generate_avatar_gradient

AVATAR_GRADIENT_EXTENSION_URL = "urn:quillmedical:avatar-gradient"


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


def extract_avatar_gradient(patient_dict: dict) -> dict[str, str] | None:
    """Extract avatar gradient colors from FHIR Patient extension.

    Args:
        patient_dict: FHIR Patient resource as dictionary.

    Returns:
        dict with colorFrom and colorTo, or None if extension not present.

    Example:
        >>> gradient = extract_avatar_gradient(patient)
        >>> gradient
        {"colorFrom": "#FF6B6B", "colorTo": "#4ECDC4"}
    """
    extensions = patient_dict.get("extension", [])

    for ext in extensions:
        if ext.get("url") == AVATAR_GRADIENT_EXTENSION_URL:
            # Extract nested extensions
            color_from = None
            color_to = None

            for sub_ext in ext.get("extension", []):
                if sub_ext.get("url") == "colorFrom":
                    color_from = sub_ext.get("valueString")
                elif sub_ext.get("url") == "colorTo":
                    color_to = sub_ext.get("valueString")

            if color_from and color_to:
                return {"colorFrom": color_from, "colorTo": color_to}

    return None


def add_avatar_gradient_extension(
    patient: Patient, gradient: dict[str, str] | None = None
) -> None:
    """Add avatar gradient colors extension to FHIR Patient.

    Args:
        patient: FHIR Patient resource instance.
        gradient: Optional gradient dict. If None, generates new colors.

    Example:
        >>> patient = Patient()
        >>> add_avatar_gradient_extension(patient)
        >>> # patient.extension now contains gradient colors
    """
    if gradient is None:
        gradient = generate_avatar_gradient()

    # Create nested extensions for colorFrom and colorTo
    color_from_ext = Extension()
    color_from_ext.url = "colorFrom"
    color_from_ext.valueString = gradient["colorFrom"]

    color_to_ext = Extension()
    color_to_ext.url = "colorTo"
    color_to_ext.valueString = gradient["colorTo"]

    # Create parent extension
    avatar_ext = Extension()
    avatar_ext.url = AVATAR_GRADIENT_EXTENSION_URL
    avatar_ext.extension = [color_from_ext, color_to_ext]

    # Add to patient extensions
    if patient.extension is None:
        patient.extension = []
    patient.extension.append(avatar_ext)


def create_fhir_patient(
    given_name: str,
    family_name: str,
    birth_date: str | None = None,
    gender: str | None = None,
    nhs_number: str | None = None,
    mrn: str | None = None,
    patient_id: str | None = None,
) -> dict:
    """Create a new FHIR Patient resource.

    Args:
        given_name (str): Patient's first/given name.
        family_name (str): Patient's family/last name.
        birth_date (str | None): Date of birth in YYYY-MM-DD format.
        gender (str | None): Gender (male, female, other, unknown).
        nhs_number (str | None): NHS number (10-digit UK national identifier).
        mrn (str | None): Medical Record Number (local hospital identifier).
        patient_id (str | None): Optional ID for the patient.

    Returns:
        dict: Created patient resource as dictionary.

    Raises:
        Exception: If creation fails.
    """
    fhir = get_fhir_client()

    # Create Patient resource
    patient = Patient()

    # Generate UUID for client-assigned ID (standard FHIR pattern)
    # FHIR servers must support client-assigned IDs via PUT requests
    patient_uuid = patient_id if patient_id else str(uuid.uuid4())
    patient.id = patient_uuid

    # Create name
    name = HumanName()
    name.given = [given_name]
    name.family = family_name
    name.use = "official"

    patient.name = [name]

    # Add birth date if provided
    if birth_date:
        patient.birthDate = FHIRDate(birth_date)

    # Add gender if provided (must be one of: male, female, other, unknown)
    if gender and gender.lower() in ["male", "female", "other", "unknown"]:
        patient.gender = gender.lower()

    # Add identifiers
    identifiers = []

    # NHS Number (UK national identifier)
    if nhs_number:
        from fhirclient.models.identifier import Identifier

        nhs_id = Identifier()
        nhs_id.system = "https://fhir.nhs.uk/Id/nhs-number"
        nhs_id.value = nhs_number
        identifiers.append(nhs_id)

    # Medical Record Number (local hospital identifier)
    if mrn:
        from fhirclient.models.identifier import Identifier

        mrn_id = Identifier()
        mrn_id.system = "http://hospital.example.org/identifiers/mrn"
        mrn_id.value = mrn
        identifiers.append(mrn_id)

    if identifiers:
        patient.identifier = identifiers

    # Add avatar gradient extension (generate colors automatically)
    add_avatar_gradient_extension(patient)

    # Use PUT to create with client-assigned UUID (standard FHIR pattern)
    # PUT /Patient/{uuid} creates the resource with our specified ID
    # This is standard FHIR behavior - no server configuration needed
    fhir.server.put_json(f"Patient/{patient_uuid}", patient.as_json())

    # Return the patient data with the UUID
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


def delete_fhir_patient(patient_id: str) -> bool:
    """Delete a FHIR Patient resource by ID.

    WARNING: This function is ONLY for development/testing purposes!
    It should NOT be exposed via API endpoints in production.
    Patient data should be soft-deleted (Patient.active = false) instead.

    Args:
        patient_id (str): FHIR Patient resource ID to delete.

    Returns:
        bool: True if deletion successful, False otherwise.
    """
    fhir = get_fhir_client()

    try:
        patient = Patient.read(patient_id, fhir.server)
        patient.delete()
        return True
    except Exception:
        return False


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
