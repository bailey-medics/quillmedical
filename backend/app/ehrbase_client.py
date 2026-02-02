"""EHRbase client for OpenEHR operations."""

import base64
from typing import Any

import requests

from app.config import settings


def get_auth_header() -> dict[str, str]:
    """Get Basic Auth header for EHRbase."""
    credentials = f"{settings.EHRBASE_USER}:{settings.EHRBASE_PASSWORD.get_secret_value()}"
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
    """
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
    return response.json()


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
    """
    url = f"{settings.EHRBASE_URL}/rest/openehr/v1/ehr"
    headers = get_auth_header()
    params = {"subject_id": subject_id, "subject_namespace": subject_namespace}

    response = requests.get(url, params=params, headers=headers)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


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
        return ehr["ehr_id"]["value"]

    new_ehr = create_ehr(subject_id, subject_namespace)
    return new_ehr["ehr_id"]["value"]


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
    return response.json()


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
    return response.json()


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
    return response.json()


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
    return response.json()


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
    return response.json()


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
    return result.get("rows", [])
