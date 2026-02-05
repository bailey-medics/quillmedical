"""Pydantic schemas for clinical letter operations.

This module defines request models for creating and managing patient
letters stored in EHRbase as OpenEHR compositions.
"""

from pydantic import BaseModel


class LetterIn(BaseModel):
    """Clinical letter creation request payload.

    Attributes:
        title: Letter title/subject.
        body: Letter content in Markdown format.
        author_name: Optional author's full name.
        author_email: Optional author's email address.
    """

    title: str
    body: str
    author_name: str | None = None
    author_email: str | None = None
