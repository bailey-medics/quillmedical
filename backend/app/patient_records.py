from pathlib import Path

from pydantic import BaseModel, Field

# where compose mounts ./patient_data -> /patient_data

PATIENT_DATA_ROOT = Path("/patient_data")


def patient_repo_name(patient_id: str) -> str:
    """Return a safe repo folder name for a patient id."""
    safe = "".join(
        ch if (ch.isalnum() or ch in "-_") else "-" for ch in patient_id
    )
    return f"patient-{safe}"


def ensure_repo_exists(repo: str, private: bool = False) -> None:
    """Create repo folder if missing."""
    repo_path = PATIENT_DATA_ROOT / repo
    repo_path.mkdir(parents=True, exist_ok=True)


def write_file(
    repo: str,
    path: str,
    content: str,
    commit_message: str = "",
    author_name: str | None = None,
    author_email: str | None = None,
) -> dict:
    """Write content to a file under the repo. Returns basic path info."""
    file_path = PATIENT_DATA_ROOT / repo / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")
    return {"path": str(file_path)}


def read_file(repo: str, path: str) -> str | None:
    """Return file content or None if missing."""
    file_path = PATIENT_DATA_ROOT / repo / path
    if not file_path.exists():
        return None
    return file_path.read_text(encoding="utf-8")


class PatientCreate(BaseModel):
    patient_id: str = Field(description="Non-PII ID (e.g. UUID v4)")
