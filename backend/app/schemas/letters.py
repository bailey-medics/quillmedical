from pydantic import BaseModel


class LetterIn(BaseModel):
    """Input model for composing a patient letter."""

    title: str
    body: str
    author_name: str | None = None
    author_email: str | None = None
