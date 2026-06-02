"""Database and client modules for Quill Medical.

This module provides database connections and API clients for the three-database
architecture:
- core_db: Core application state (PostgreSQL)
- fhir_client: FHIR server API client (HAPI FHIR)
- ehrbase_client: EHRbase server API client (OpenEHR)
"""

from app.db.core_db import (
    CoreBase,
    CoreSessionLocal,
    core_engine,
    get_core_db,
)

__all__ = [
    "core_engine",
    "CoreSessionLocal",
    "CoreBase",
    "get_core_db",
]
