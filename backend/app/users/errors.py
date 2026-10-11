"""Why a change to somebody's account was refused.

The same shape as ``MessagingError`` in :mod:`app.messaging`. Each
refusal is a class that fixes its own words and status, and takes no
arguments, so nothing can reach a caller that somebody did not write for
them to read: there is nowhere to put an id, a query or a value from the
database.

``app.main`` registers one handler for :class:`UserAdminError`, which
answers with the class's status and ``{"detail": message}``. That is the
body an ``HTTPException`` gives, so a rule moved out of a route answers
exactly as it did inside it.
"""


class UserAdminError(Exception):
    """A change to somebody's account that may not, or cannot, be made."""

    status_code: int = 400
    message: str = "The request could not be completed"

    def __init__(self) -> None:
        super().__init__(self.message)


class UsernameTaken(UserAdminError):
    message = "Username already exists"


class EmailRequired(UserAdminError):
    message = "Email is required"


class EmailTaken(UserAdminError):
    message = "Email already exists"


class PasswordTooShort(UserAdminError):
    message = "Password must be at least 8 characters"
