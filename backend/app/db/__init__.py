"""Database and client modules for Quill Medical.

This module provides database connections and API clients for the three-database
architecture:
- auth_db: Authentication and application state (PostgreSQL)
- fhir_client: FHIR server API client (HAPI FHIR)
- ehrbase_client: EHRbase server API client (OpenEHR)
"""

from app.db.auth_db import (
    AuthBase,
    AuthSessionLocal,
    auth_engine,
    get_auth_db,
)

__all__ = [
    "auth_engine",
    "AuthSessionLocal",
    "AuthBase",
    "get_auth_db",
]
