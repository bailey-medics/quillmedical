"""Pydantic schemas for organisation feature management."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FeatureOut(BaseModel):
    """Response schema for an enabled organisation feature."""

    feature_key: str
    enabled_at: datetime
    enabled_by: int | None = None


class FeatureToggleIn(BaseModel):
    """Request schema: enable or disable a feature on an org."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool
