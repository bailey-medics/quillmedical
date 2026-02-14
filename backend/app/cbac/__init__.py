# backend/app/cbac/__init__.py
"""Competency-Based Access Control (CBAC) module for Quill Medical.

This module implements CBAC authorization, allowing users to have specific
clinical competencies rather than rigid job roles.
"""

from app.cbac.base_professions import (
    PROFESSION_IDS,
    BaseProfessionId,
    get_profession_base_competencies,
    get_profession_details,
    resolve_user_competencies,
)
from app.cbac.competencies import (
    COMPETENCY_IDS,
    ClinicalCompetency,
    CompetencyId,
    get_competency_details,
    get_competency_risk_level,
    is_valid_competency,
)

__all__ = [
    "CompetencyId",
    "ClinicalCompetency",
    "get_competency_details",
    "is_valid_competency",
    "get_competency_risk_level",
    "COMPETENCY_IDS",
    "BaseProfessionId",
    "get_profession_details",
    "get_profession_base_competencies",
    "resolve_user_competencies",
    "PROFESSION_IDS",
]
