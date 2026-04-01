"""Pydantic schemas for clinical letter operations.

This module defines request models for creating and managing patient
letters stored in EHRbase as OpenEHR compositions.
"""

from pydantic import BaseModel, EmailStr, Field


class LetterIn(BaseModel):
    """Clinical letter creation request payload.

    Attributes:
        title: Letter title/subject (max 500 characters).
        body: Letter content in Markdown format (max 100,000 characters).
        author_name: Optional author's full name (max 200 characters).
        author_email: Optional author's email address (validated format).
    """

    title: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1, max_length=100_000)
    author_name: str | None = Field(None, max_length=200)
    author_email: EmailStr | None = None

    model_config = {"extra": "forbid"}
