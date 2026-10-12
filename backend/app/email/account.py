"""What every account email says about whose account it is.

Moved out of ``main.py`` on 12 October 2026, so that the user
administration routes and the sign-in routes can both use it from
their own modules.
"""

from app.models import User


def account_email_values(user: User) -> dict[str, str]:
    """What every account email says about whose account it is.

    The invite, the verification and the password reset all greet the
    person, give their username and say which address the email went to.
    People log in with the username and may have forgotten it, and many
    read several addresses in one mailbox, so the address tells them
    which account this is about.

    Args:
        user: The account the email is about.

    Returns:
        The ``name``, ``username`` and ``email`` those templates name.
    """
    return {
        "name": user.full_name or user.username,
        "username": user.username,
        "email": user.email,
    }
