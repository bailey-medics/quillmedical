import json
from pathlib import Path

from app import main as main_mod


def test_patient_repo_name_sanitizes():
    assert main_mod.patient_repo_name("abc123") == "patient-abc123"
    assert main_mod.patient_repo_name("A B/C?D") == "patient-A-B-C-D"
    assert main_mod.patient_repo_name("..hidden") == "patient---hidden"


def test_write_and_read_file(tmp_path, monkeypatch):
    # Point the module's PATIENT_DATA_ROOT at a temporary directory
    monkeypatch.setattr(main_mod, "PATIENT_DATA_ROOT", Path(tmp_path))

    repo = main_mod.patient_repo_name("demo-1")

    # ensure repo folder can be created
    main_mod.ensure_repo_exists(repo)
    repo_path = Path(tmp_path) / repo
    assert repo_path.exists() and repo_path.is_dir()

    # write a demographics file and read it back
    payload = {"given_name": "Alice", "family_name": "Smith"}
    content = json.dumps(payload, separators=(",", ":"))
    res = main_mod.write_file(repo, "demographics/profile.json", content)
    written_path = Path(res["path"])
    assert written_path.exists()

    read = main_mod.read_file(repo, "demographics/profile.json")
    assert read is not None
    assert json.loads(read) == payload

    # reading a missing file should return None
    assert main_mod.read_file(repo, "does/not/exist.txt") is None
