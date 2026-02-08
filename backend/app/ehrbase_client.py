"""EHRbase client for OpenEHR operations."""

import base64
from typing import Any

import requests

from app.config import settings


def get_auth_header() -> dict[str, str]:
    """Get Basic Auth header for EHRbase."""
    credentials = f"{settings.EHRBASE_API_USER}:{settings.EHRBASE_API_PASSWORD.get_secret_value()}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


def create_ehr(
    subject_id: str, subject_namespace: str = "fhir"
) -> dict[str, Any]:
    """
    Create a new EHR in EHRbase.

    Args:
        subject_id: The FHIR Patient ID
        subject_namespace: The namespace (default: 'fhir')

    Returns:
        EHR response containing ehr_id

    Raises:
        ValueError: If subject_id is empty or invalid
    """
    # Defensive programming: validate inputs
    if not subject_id or not subject_id.strip():
        raise ValueError("subject_id cannot be empty")
    if not subject_namespace or not subject_namespace.strip():
        raise ValueError("subject_namespace cannot be empty")
    url = f"{settings.EHRBASE_URL}/rest/openehr/v1/ehr"
    headers = {
        **get_auth_header(),
        "Content-Type": "application/json",
    }

    payload = {
        "_type": "EHR_STATUS",
        "subject": {
            "external_ref": {
                "id": {
                    "_type": "GENERIC_ID",
                    "value": subject_id,
                    "scheme": subject_namespace,
                },
                "namespace": subject_namespace,
                "type": "PERSON",
            }
        },
        "is_modifiable": True,
        "is_queryable": True,
    }

    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


def get_ehr_by_subject(
    subject_id: str, subject_namespace: str = "fhir"
) -> dict[str, Any] | None:
    """
    Get an EHR by subject ID.

    Args:
        subject_id: The FHIR Patient ID
        subject_namespace: The namespace (default: 'fhir')

    Returns:
        EHR response or None if not found

    Raises:
        ValueError: If subject_id is empty
    """
    # Defensive programming: validate inputs
    if not subject_id or not subject_id.strip():
        raise ValueError("subject_id cannot be empty")
    url = f"{settings.EHRBASE_URL}/rest/openehr/v1/ehr"
    headers = get_auth_header()
    params = {"subject_id": subject_id, "subject_namespace": subject_namespace}

    response = requests.get(url, params=params, headers=headers)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


def get_or_create_ehr(subject_id: str, subject_namespace: str = "fhir") -> str:
    """
    Get existing EHR or create new one for a subject.

    Args:
        subject_id: The FHIR Patient ID
        subject_namespace: The namespace (default: 'fhir')

    Returns:
        ehr_id (UUID string)
    """
    ehr = get_ehr_by_subject(subject_id, subject_namespace)
    if ehr:
        return ehr["ehr_id"]["value"]  # type: ignore[no-any-return]

    new_ehr = create_ehr(subject_id, subject_namespace)
    return new_ehr["ehr_id"]["value"]  # type: ignore[no-any-return]


def upload_template(template_xml: str) -> dict[str, Any]:
    """
    Upload an OpenEHR template (OPT) to EHRbase.

    Args:
        template_xml: The template in XML format

    Returns:
        Template upload response
    """
    url = f"{settings.EHRBASE_URL}/rest/openehr/v1/definition/template/adl1.4"
    headers = {
        **get_auth_header(),
        "Content-Type": "application/xml",
    }

    response = requests.post(url, data=template_xml, headers=headers)
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


def list_templates() -> list[str]:
    """
    List all templates available in EHRbase.

    Returns:
        List of template IDs
    """
    url = f"{settings.EHRBASE_URL}/rest/openehr/v1/definition/template/adl1.4"
    headers = get_auth_header()

    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


def create_composition(
    ehr_id: str, template_id: str, composition_data: dict[str, Any]
) -> dict[str, Any]:
    """
    Create a composition (clinical document) in EHRbase.

    Args:
        ehr_id: The EHR UUID
        template_id: The template ID
        composition_data: The composition content in JSON format

    Returns:
        Created composition response
    """
    url = f"{settings.EHRBASE_URL}/rest/openehr/v1/ehr/{ehr_id}/composition"
    headers = {
        **get_auth_header(),
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    response = requests.post(url, json=composition_data, headers=headers)
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


def get_composition(ehr_id: str, composition_uid: str) -> dict[str, Any]:
    """
    Retrieve a composition by UID.

    Args:
        ehr_id: The EHR UUID
        composition_uid: The composition UID

    Returns:
        Composition data
    """
    url = f"{settings.EHRBASE_URL}/rest/openehr/v1/ehr/{ehr_id}/composition/{composition_uid}"
    headers = get_auth_header()

    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


def query_aql(aql_query: str) -> dict[str, Any]:
    """
    Execute an AQL query against EHRbase.

    Args:
        aql_query: The AQL query string

    Returns:
        Query results
    """
    url = f"{settings.EHRBASE_URL}/rest/openehr/v1/query/aql"
    headers = {
        **get_auth_header(),
        "Content-Type": "application/json",
    }

    payload = {"q": aql_query}

    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


def list_compositions_for_ehr(ehr_id: str) -> list[dict[str, Any]]:
    """
    List all compositions for an EHR using AQL.

    Args:
        ehr_id: The EHR UUID

    Returns:
        List of compositions
    """
    aql = f"""
    SELECT c
    FROM EHR e[ehr_id/value='{ehr_id}']
    CONTAINS COMPOSITION c
    """

    result = query_aql(aql)
    return result.get("rows", [])  # type: ignore[no-any-return]


def create_letter_composition(
    patient_id: str, title: str, body: str, author_name: str | None = None
) -> dict[str, Any]:
    """
    Create a letter/correspondence composition in OpenEHR.

    Args:
        patient_id: FHIR Patient ID
        title: Letter title
        body: Letter content (markdown)
        author_name: Optional author name

    Returns:
        Created composition response with composition_uid
    """
    from datetime import UTC, datetime

    # Get or create EHR for this patient
    ehr_id = get_or_create_ehr(patient_id)

    # Create a simple letter composition
    # Using a generic composition structure for letters
    composition_data = {
        "_type": "COMPOSITION",
        "name": {"_type": "DV_TEXT", "value": title},
        "archetype_node_id": "openEHR-EHR-COMPOSITION.report.v1",
        "language": {
            "_type": "CODE_PHRASE",
            "terminology_id": {
                "_type": "TERMINOLOGY_ID",
                "value": "ISO_639-1",
            },
            "code_string": "en",
        },
        "territory": {
            "_type": "CODE_PHRASE",
            "terminology_id": {
                "_type": "TERMINOLOGY_ID",
                "value": "ISO_3166-1",
            },
            "code_string": "US",
        },
        "category": {
            "_type": "DV_CODED_TEXT",
            "value": "event",
            "defining_code": {
                "_type": "CODE_PHRASE",
                "terminology_id": {
                    "_type": "TERMINOLOGY_ID",
                    "value": "openehr",
                },
                "code_string": "433",
            },
        },
        "composer": {
            "_type": "PARTY_IDENTIFIED",
            "name": author_name or "System",
        },
        "context": {
            "_type": "EVENT_CONTEXT",
            "start_time": {
                "_type": "DV_DATE_TIME",
                "value": datetime.now(UTC).isoformat(),
            },
            "setting": {
                "_type": "DV_CODED_TEXT",
                "value": "other care",
                "defining_code": {
                    "_type": "CODE_PHRASE",
                    "terminology_id": {
                        "_type": "TERMINOLOGY_ID",
                        "value": "openehr",
                    },
                    "code_string": "238",
                },
            },
        },
        "content": [
            {
                "_type": "EVALUATION",
                "name": {"_type": "DV_TEXT", "value": "Letter"},
                "archetype_node_id": "openEHR-EHR-EVALUATION.clinical_synopsis.v1",
                "data": {
                    "_type": "ITEM_TREE",
                    "name": {"_type": "DV_TEXT", "value": "Tree"},
                    "archetype_node_id": "at0001",
                    "items": [
                        {
                            "_type": "ELEMENT",
                            "name": {"_type": "DV_TEXT", "value": "Synopsis"},
                            "archetype_node_id": "at0002",
                            "value": {"_type": "DV_TEXT", "value": body},
                        }
                    ],
                },
            }
        ],
    }

    return create_composition(
        ehr_id, "openEHR-EHR-COMPOSITION.report.v1", composition_data
    )


def get_letter_composition(
    patient_id: str, composition_uid: str
) -> dict[str, Any] | None:
    """
    Retrieve a letter composition from OpenEHR.

    Args:
        patient_id: FHIR Patient ID
        composition_uid: The composition UID

    Returns:
        Composition data or None if not found
    """
    try:
        ehr = get_ehr_by_subject(patient_id)
        if not ehr:
            return None

        ehr_id = ehr["ehr_id"]["value"]
        return get_composition(ehr_id, composition_uid)
    except Exception:
        return None


def list_letters_for_patient(patient_id: str) -> list[dict[str, Any]]:
    """
    List all letter compositions for a patient.

    Args:
        patient_id: FHIR Patient ID

    Returns:
        List of letter compositions with metadata
    """
    try:
        ehr = get_ehr_by_subject(patient_id)
        if not ehr:
            return []

        ehr_id = ehr["ehr_id"]["value"]

        # Query for all report compositions (letters)
        aql = f"""
        SELECT
            c/uid/value as composition_uid,
            c/name/value as title,
            c/context/start_time/value as created_at,
            c/composer/name as author
        FROM EHR e[ehr_id/value='{ehr_id}']
        CONTAINS COMPOSITION c[openEHR-EHR-COMPOSITION.report.v1]
        ORDER BY c/context/start_time/value DESC
        """

        result = query_aql(aql)
        return result.get("rows", [])  # type: ignore[no-any-return]
    except Exception:
        return []
