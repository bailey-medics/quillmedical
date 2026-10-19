"""What the scan job reports, and what it is told back."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ScanCompleteIn(BaseModel):
    """One object's verdict, as the scan job reports it.

    ``signature`` is what ClamAV named for ``infected`` and the reason
    for ``failed``; ``definitions`` is ClamAV's version line, so the
    record says what the file was scanned with.
    """

    model_config = ConfigDict(extra="forbid")

    bucket: str = Field(min_length=1, max_length=222)
    object_key: str = Field(min_length=1, max_length=1024)
    verdict: Literal["clean", "infected", "failed"]
    signature: str | None = Field(None, max_length=255)
    definitions: str | None = Field(None, max_length=255)


class ScanCompleteOut(BaseModel):
    """Confirmation that the verdict was recorded."""

    recorded: bool
    verdict: Literal["clean", "infected", "failed"]
