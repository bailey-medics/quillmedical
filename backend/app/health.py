"""The health check, and the two probes it and start-up share.

Moved out of ``main.py`` on 12 October 2026, as they were. ``main.py``
includes this router under the API prefix, and its start-up message
calls the same two probes.
"""

from typing import cast

import httpx
from fastapi import (
    APIRouter,
)

from app.config import settings
from app.schemas.auth import (
    HealthCheckOut,
    ServiceHealthStatus,
)

router = APIRouter()


def check_fhir_health() -> dict[str, bool | int | str]:
    """Check if FHIR server is available and ready to serve data.

    Tests actual patient data access rather than just metadata endpoint,
    since HAPI FHIR can return metadata before it's ready to serve resources.

    Safety-critical: This determines whether frontend shows "Database initialising"
    vs "No patients to show". False positive could cause clinical staff to think
    database is empty when it's still loading.

    Returns:
        dict with 'available' boolean and optional 'error' message
    """
    if not settings.CLINICAL_SERVICES_ENABLED:
        return {"available": False, "error": "Clinical services disabled"}
    try:
        # Test actual data access, not just metadata
        # This ensures database is ready and indexes are loaded
        response = httpx.get(
            f"{settings.FHIR_SERVER_URL}/Patient?_count=1", timeout=5.0
        )
        # 200 = success (even if 0 patients), means FHIR is truly ready
        # Other codes mean FHIR still loading or has errors
        return {
            "available": response.status_code == 200,
            "status_code": response.status_code,
        }
    except Exception as e:
        return {"available": False, "error": str(e)}


def check_ehrbase_health() -> dict[str, bool | int | str]:
    """Check if EHRbase server is available.

    Returns:
        dict with 'available' boolean and optional 'error' message
    """
    if not settings.CLINICAL_SERVICES_ENABLED:
        return {"available": False, "error": "Clinical services disabled"}
    try:
        # Use get_secret_value() to extract the actual password string
        api_user = settings.EHRBASE_API_USER
        api_password: str = settings.EHRBASE_API_PASSWORD.get_secret_value()

        response = httpx.get(
            f"{settings.EHRBASE_URL}/rest/openehr/v1/definition/template/adl1.4",
            timeout=5.0,
            auth=(api_user, api_password),
        )
        return {
            "available": response.status_code
            in (200, 404),  # 404 = no templates but server works
            "status_code": response.status_code,
        }
    except Exception as e:
        return {"available": False, "error": str(e)}


@router.get("/health", response_model=HealthCheckOut)
def health_check() -> HealthCheckOut:
    """Health Check Endpoint.

    Checks availability of all required services (FHIR, EHRbase).
    Returns overall status and detailed service availability.

    Returns:
        dict: Health status with service availability details
    """
    services: dict[str, dict[str, bool | int | str]] = {
        "core_db": {
            "available": True
        },  # If we can respond, core DB is working
    }

    # Only check FHIR/EHRbase when clinical services are enabled
    if settings.CLINICAL_SERVICES_ENABLED:
        services["fhir"] = check_fhir_health()
        services["ehrbase"] = check_ehrbase_health()
    else:
        services["fhir"] = {
            "available": False,
            "error": "Not provisioned",
        }
        services["ehrbase"] = {
            "available": False,
            "error": "Not provisioned",
        }

    all_healthy = all(s.get("available", False) for s in services.values())

    return HealthCheckOut(
        status="healthy" if all_healthy else "degraded",
        # The same dictionaries, under the wider type the model declares:
        # a dict is not accepted where one with more value types is asked
        # for, though every value here fits.
        services=cast(
            dict[
                str, ServiceHealthStatus | dict[str, bool | int | str | None]
            ],
            services,
        ),
    )
