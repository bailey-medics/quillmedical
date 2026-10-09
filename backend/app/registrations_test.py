"""The registration bodies a professional registration may name."""

from __future__ import annotations

import pytest

from app.models import ProfessionalRegistration
from app.registrations import (
    REGISTRATION_AUTHORITIES,
    canonical_authority,
    validate_registration_authority,
)


def test_the_uk_bodies_are_listed() -> None:
    assert REGISTRATION_AUTHORITIES == ("GMC", "NMC", "GPhC", "HCPC")


@pytest.mark.parametrize(
    "given,expected",
    [("GMC", "GMC"), ("gmc", "GMC"), (" GpHc ", "GPhC"), ("hcpc", "HCPC")],
)
def test_a_body_is_matched_regardless_of_case(
    given: str, expected: str
) -> None:
    assert canonical_authority(given) == expected


def test_an_unlisted_body_matches_nothing() -> None:
    assert canonical_authority("General Medical Council") is None


def test_validation_refuses_an_unlisted_body() -> None:
    with pytest.raises(ValueError, match="Known bodies are GMC"):
        validate_registration_authority("BMA")


def test_the_model_refuses_an_unlisted_body() -> None:
    """The last line of defence, behind the route's own 422."""
    with pytest.raises(ValueError, match="Unknown registration body"):
        ProfessionalRegistration(authority="BMA", number="1")
