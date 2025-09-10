from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime
import json
from pathlib import Path

app = FastAPI(title="Quill API")


# where compose mounts ./patient_data -> /patient_data
PATIENT_DATA_ROOT = Path("/patient_data")


def patient_repo_name(patient_id: str) -> str:
    """Return a safe repo folder name for a patient id."""
    safe = "".join(ch if (ch.isalnum() or ch in "-_") else "-" for ch in patient_id)
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


@app.post("/api/patients")
def create_patient_repo(payload: PatientCreate):
    repo = patient_repo_name(payload.patient_id)
    try:
        ensure_repo_exists(repo, private=True)
        ts = datetime.utcnow().strftime("%Y-%m-%dT%H%M%SZ")
        readme = (
            f"# Patient Repository: {repo}\n\n"
            "Folders:\n"
            "- `demographics/` – non-clinical demographics JSON\n"
            "- `letters/` – correspondence in Markdown/PDF\n\n"
            f"*Initialized {ts} UTC*\n"
        )
        write_file(
            repo,
            "README.md",
            readme,
            "chore: add patient README",
        )
        return {"repo": repo, "initialized": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/patients")
def list_patients():
    """Return all patient repos and any demographics if present."""
    try:
        patients = []
        if PATIENT_DATA_ROOT.exists():
            for entry in sorted(PATIENT_DATA_ROOT.iterdir()):
                if entry.is_dir() and entry.name.startswith("patient-"):
                    demo_content = read_file(entry.name, "demographics/profile.json")
                    demo = None
                    if demo_content:
                        try:
                            demo = json.loads(demo_content)
                        except Exception:
                            demo = {"raw": demo_content}
                    patients.append({"repo": entry.name, "demographics": demo})
        return {"patients": patients}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class Demographics(BaseModel):
    # keep it minimal; expand schema later
    given_name: str | None = None
    family_name: str | None = None
    date_of_birth: str | None = None  # ISO date
    sex: str | None = None
    address: dict | None = None
    contact: dict | None = None
    # NEVER include NHS number or direct identifiers in repo name.
    # Store such PII elsewhere (DB).
    meta: dict | None = None


@app.put("/api/patients/{patient_id}/demographics")
def upsert_demographics(patient_id: str, demographics: Demographics):
    repo = patient_repo_name(patient_id)
    try:
        ensure_repo_exists(repo)
        ts = datetime.utcnow().strftime("%Y-%m-%dT%H%M%SZ")
        path = "demographics/profile.json"
        import json

        content = json.dumps(
            {"updated_at_utc": ts, **demographics.model_dump()}, indent=2
        )
        # write_file returns a path info dict; we don't need to use it here
        write_file(repo, path, content, "feat: upsert demographics")
        return {"repo": repo, "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/patients/{patient_id}/demographics")
def get_demographics(patient_id: str):
    repo = patient_repo_name(patient_id)
    try:
        content = read_file(repo, "demographics/profile.json")
        if content is None:
            raise HTTPException(status_code=404, detail="No demographics found")
        return {"repo": repo, "content": content}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------- Letters --------


class LetterIn(BaseModel):
    title: str
    body: str
    author_name: str | None = None
    author_email: str | None = None


@app.post("/api/patients/{patient_id}/letters")
def write_letter(patient_id: str, letter: LetterIn):
    repo = patient_repo_name(patient_id)
    ts = datetime.utcnow().strftime("%Y-%m-%dT%H%M%SZ")
    slug = "".join(
        ch if (ch.isalnum() or ch in "-_") else "-" for ch in letter.title.lower()
    ).strip("-")
    filename = f"letters/{ts}-{slug or 'letter'}.md"
    md = f"# {letter.title}\n\n{letter.body}\n\n*Written at {ts} UTC*"
    try:
        ensure_repo_exists(repo)
        write_file(
            repo,
            filename,
            md,
            f"feat: add letter '{letter.title}'",
            letter.author_name,
            letter.author_email,
        )
        return {
            "repo": repo,
            "path": filename,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/patients/{patient_id}/letters/{name}")
def read_letter(patient_id: str, name: str):
    repo = patient_repo_name(patient_id)
    path = f"letters/{name}.md" if not name.endswith(".md") else f"letters/{name}"
    try:
        content = read_file(repo, path)
        if content is None:
            raise HTTPException(status_code=404, detail="Letter not found")
        return {"repo": repo, "path": path, "content": content}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
