"""Teaching content contract: schemas and validation for question banks.

This package defines what a bank's `module.yaml` and `assessment.yaml` may
contain, and validates content against it.  It is the single source of truth
for that contract, used at both gates:

* content-repo CI, before a pull request can merge;
* backend sync, before a bank goes live.

**It must stay dependency-light.**  Nothing here may import ``app.models``,
``app.db``, ``app.config``, FastAPI, SQLAlchemy, or anything from its parent
package.  The whole point is that a content repo's CI job can run this with
only ``pydantic`` and ``pyyaml`` installed and no environment variables —
``Settings`` requires ``JWT_SECRET`` and ``CORE_DB_PASSWORD``, which a YAML
validator has no business needing.

``backend/tests/test_features_import_boundary.py`` enforces this.
"""
