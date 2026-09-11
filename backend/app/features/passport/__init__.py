"""Clinician passport — a portable record of assessed competence.

Deliberately docstring-only, like :mod:`app.features`. Anything imported
here would run on every ``app.features.passport.*`` import, and the
modules beneath are deliberately cheap: :mod:`.paths`, :mod:`.ids` and
:mod:`.schemas` need no FastAPI, no SQLAlchemy and no settings, so they
stay importable by tooling that only wants to read a passport off disk.

Enforced by ``backend/tests/test_features_import_boundary.py``.
"""
