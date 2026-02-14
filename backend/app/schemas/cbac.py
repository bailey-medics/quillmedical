# backend/app/schemas/cbac.py
"""Pydantic schemas for CBAC API endpoints."""

from pydantic import BaseModel, Field


class CompetencyCheck(BaseModel):
    """Request to check if user has a competency."""

    user_id: int
    competency: str


class CompetencyCheckResponse(BaseModel):
    """Response for competency check."""

    has_competency: bool
    reason: str | None = None


class UpdateCompetenciesRequest(BaseModel):
    """Request to update user's additional/removed competencies."""

    additional_competencies: list[str] | None = None
    removed_competencies: list[str] | None = None


class UserCompetenciesResponse(BaseModel):
    """Response with user's competencies."""

    user_id: int
    username: str
    base_profession: str
    additional_competencies: list[str]
    removed_competencies: list[str]
    final_competencies: list[str]


class ProfessionalRegistration(BaseModel):
    """Professional registration details (GMC, NMC, DEA, etc.)."""

    registration_type: str = Field(
        ..., description="Type of registration (GMC, NMC, GPhC, DEA, etc.)"
    )
    registration_number: str = Field(..., description="Registration number")
    registration_status: str = Field(
        default="active", description="Status (active, expired, suspended)"
    )
    expiry_date: str | None = Field(
        None, description="Expiry date (ISO format)"
    )
    verified_at: str | None = Field(
        None,
        description="When this registration was last verified (ISO format)",
    )


class PrescriptionRequest(BaseModel):
    """Example prescription request schema."""

    patient_id: str
    medication: str
    dose: str
    duration_days: int
