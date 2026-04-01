"""Pydantic schemas for organisation feature management."""

from datetime import datetime

from pydantic import BaseModel


class FeatureOut(BaseModel):
    """Response schema for an enabled organisation feature."""

    feature_key: str
    enabled_at: datetime
    enabled_by: int | None = None


class FeatureToggleIn(BaseModel):
    """Request schema: enable or disable a feature on an org."""

    enabled: bool

    model_config = {"extra": "forbid"}
