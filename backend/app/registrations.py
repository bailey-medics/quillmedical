"""The professional registration bodies a registration may name.

Read from the default jurisdiction in ``shared/jurisdiction-config.yaml``,
so a body is added there and needs no migration — the choice
``validate_org_unit_type`` made for org unit types. For the UK these are
the GMC, NMC, GPhC and HCPC.
"""

from __future__ import annotations

from typing import Any

import yaml

from app.paths import SHARED_DIR

JURISDICTION_CONFIG_PATH = SHARED_DIR / "jurisdiction-config.yaml"


def _load_authorities() -> tuple[str, ...]:
    """The registration body ids of the default jurisdiction."""
    with open(JURISDICTION_CONFIG_PATH, encoding="utf-8") as f:
        data: dict[str, Any] = yaml.safe_load(f)

    default = data["default_jurisdiction"]
    bodies = data["jurisdictions"][default]["professional_registrations"]
    return tuple(str(body["id"]) for body in bodies)


#: Every registration body a registration may name, spelt as the config
#: spells them.
REGISTRATION_AUTHORITIES: tuple[str, ...] = _load_authorities()


def canonical_authority(value: str) -> str | None:
    """The config's spelling of an authority, or None if it lists none.

    Matched regardless of case and surrounding space, so somebody typing
    ``gmc`` is taken to mean ``GMC`` rather than refused.

    Args:
        value: The authority as given.

    Returns:
        The listed id it matches, or None.
    """
    wanted = value.strip().casefold()
    for authority in REGISTRATION_AUTHORITIES:
        if authority.casefold() == wanted:
            return authority
    return None


def validate_registration_authority(value: str) -> str:
    """Return the authority unchanged, or raise naming the known ones.

    Args:
        value: The authority to check, already in the config's spelling.

    Returns:
        The same value.

    Raises:
        ValueError: If it is not a listed registration body.
    """
    if value not in REGISTRATION_AUTHORITIES:
        raise ValueError(
            f"Unknown registration body: {value}. Known bodies are "
            + ", ".join(REGISTRATION_AUTHORITIES)
            + "."
        )
    return value
