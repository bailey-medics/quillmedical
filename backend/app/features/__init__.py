"""Feature packages.

Deliberately docstring-only.  Anything imported here runs on every
``app.features.*`` import, so putting an executable FastAPI dependency in
this module would drag FastAPI, SQLAlchemy, ``app.models``, ``app.db`` and
``app.config`` into scope for callers that need none of them — and
``Settings`` requires ``JWT_SECRET`` and ``CORE_DB_PASSWORD``, which a YAML
validator has no business needing.

``requires_feature`` therefore lives in :mod:`app.features.gating`.
"""
