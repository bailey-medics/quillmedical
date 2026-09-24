"""Test helper for giving somebody professional registrations.

What somebody is registered with is their current
``professional_registration`` rows.

Kept out of ``conftest.py`` for the reason ``tests/places.py`` is:
importing from there would give mypy the same file under two module names.
"""

from __future__ import annotations

from app.models import ProfessionalRegistration, User


def declare(user: User, registrations: dict[str, str]) -> None:
    """Give *user* a current registration for each body and number.

    The caller commits.
    """
    for authority, number in registrations.items():
        user.registrations.append(
            ProfessionalRegistration(authority=authority, number=number)
        )
