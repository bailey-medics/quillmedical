"""Legacy file-based patient record management.

This module provides file-based storage operations for patient records
mounted at /patient_data in Docker containers. Each patient has their own
subdirectory identified by a sanitized patient ID.

Note:
    This is a legacy system. Current implementation stores patient demographics
    in FHIR and clinical documents in OpenEHR (EHRbase). This module may be
    deprecated in future releases.

Attributes:
    PATIENT_DATA_ROOT: Mount point for patient data volume (/patient_data).
"""

from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

# where compose mounts ./patient_data -> /patient_data

PATIENT_DATA_ROOT = Path("/patient_data")


class Demographics(BaseModel):
    """Patient demographic information.

    Note:
        This schema is deprecated. Use FHIR Patient resources instead.

    Attributes:
        given_name: Patient's first name.
        family_name: Patient's surname.
        date_of_birth: ISO 8601 date string (YYYY-MM-DD).
        sex: Patient's sex (male/female/other).
        address: Structured address (FHIR format).
        contact: Contact information (phone, email).
        meta: Additional metadata.
    """

    given_name: str | None = None
    family_name: str | None = None
    date_of_birth: str | None = None  # ISO date
    sex: str | None = None
    address: dict[str, Any] | None = None
    contact: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None


def patient_repo_name(patient_id: str) -> str:
    """Generate safe directory name for patient data.

    Sanitizes patient ID by removing special characters to create
    a filesystem-safe directory name.

    Args:
        patient_id: FHIR patient resource ID.

    Returns:
        str: Safe directory name like "patient-abc123".

    Raises:
        ValueError: If patient_id is empty.

    Example:
        >>> patient_repo_name("Patient/123")
        'patient-Patient-123'
    """
    # Defensive programming: validate input
    if not patient_id or not patient_id.strip():
        raise ValueError("patient_id cannot be empty")
    safe = "".join(
        ch if (ch.isalnum() or ch in "-_") else "-" for ch in patient_id
    )
    return f"patient-{safe}"


def ensure_repo_exists(repo: str, private: bool = False) -> None:
    """Create patient repository directory if it doesn't exist.

    Args:
        repo: Repository name (from patient_repo_name).
        private: Unused parameter (for future ACL implementation).
    """
    repo_path = PATIENT_DATA_ROOT / repo
    repo_path.mkdir(parents=True, exist_ok=True)


def write_file(
    repo: str,
    path: str,
    content: str,
    commit_message: str = "",
    author_name: str | None = None,
    author_email: str | None = None,
) -> dict[str, Any]:
    """Write content to a file in patient repository.

    Creates parent directories as needed. Returns path information
    for audit trail purposes.

    Args:
        repo: Repository name (from patient_repo_name).
        path: Relative file path within repository.
        content: Text content to write.
        commit_message: Unused (for future git integration).
        author_name: Unused (for future git integration).
        author_email: Unused (for future git integration).

    Returns:
        dict: Dictionary with 'path' key containing absolute file path.

    Example:
        >>> write_file("patient-123", "notes.txt", "Patient notes here")
        {'path': '/patient_data/patient-123/notes.txt'}
    """
    file_path = PATIENT_DATA_ROOT / repo / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")
    return {"path": str(file_path)}


def read_file(repo: str, path: str) -> str | None:
    """Read file content from patient repository.

    Args:
        repo: Repository name (from patient_repo_name).
        path: Relative file path within repository.

    Returns:
        str | None: File content or None if file doesn't exist.
    """
    file_path = PATIENT_DATA_ROOT / repo / path
    if not file_path.exists():
        return None
    return file_path.read_text(encoding="utf-8")


class PatientCreate(BaseModel):
    patient_id: str = Field(description="Non-PII ID (e.g. UUID v4)")
