"""
Tests for patient data management.

Note: The file-based patient repository system has been migrated to use
FHIR (for demographics) and OpenEHR (for letters/compositions).
The tests below are disabled as they tested the old file-based system.

New tests should be added to test FHIR Patient updates and OpenEHR Composition
creation through the appropriate client modules.
"""

# Legacy tests disabled - file-based system removed
# def test_patient_repo_name_sanitizes():
#     assert main_mod.patient_repo_name("abc123") == "patient-abc123"
#     assert main_mod.patient_repo_name("A B/C?D") == "patient-A-B-C-D"
#     assert main_mod.patient_repo_name("..hidden") == "patient---hidden"


# def test_write_and_read_file(tmp_path, monkeypatch):
#     # Point the module's PATIENT_DATA_ROOT at a temporary directory
#     monkeypatch.setattr(patient_records, "PATIENT_DATA_ROOT", Path(tmp_path))
#
#     repo = main_mod.patient_repo_name("demo-1")
#
#     # ensure repo folder can be created
#     main_mod.ensure_repo_exists(repo)
#     repo_path = Path(tmp_path) / repo
#     assert repo_path.exists() and repo_path.is_dir()
#
#     # write a demographics file and read it back
#     payload = {"given_name": "Alice", "family_name": "Smith"}
#     content = json.dumps(payload, separators=(",", ":"))
#     res = main_mod.write_file(repo, "demographics/profile.json", content)
#     written_path = Path(res["path"])
#     assert written_path.exists()
#
#     read = main_mod.read_file(repo, "demographics/profile.json")
#     assert read is not None
#     assert json.loads(read) == payload
#
#     # reading a missing file should return None
#     assert main_mod.read_file(repo, "does/not/exist.txt") is None


def test_placeholder():
    """Placeholder test to prevent empty test file errors."""
    assert True
