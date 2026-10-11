"""Why a change to somebody's account was refused.

The same shape as ``MessagingError`` in :mod:`app.messaging`. Each
refusal is a class that fixes its own words and status, so nothing can
reach a caller that somebody did not write for them to read.

All but two take no arguments. The two that do name catalogue ids:
:class:`CompetenciesOutOfScope` lists competency ids from
``shared/competency-definitions/``, and :class:`ProfessionOutOfScope`
names one base profession id from ``shared/base-professions.yaml``.
Those are identifiers the catalogue defines, not free text. The
profession id is checked against the catalogue as the request is read.
A competency id is either one the request named, checked the same way,
or one the person's own grant rows hold, which is the single place an
id comes from the database: it is still a catalogue id, and it is what
the caller is being told they may not remove. Nothing else may be
passed: no account id, no query, no name, and nothing a person typed.

``app.main`` registers one handler for :class:`UserAdminError`, which
answers with the class's status and ``{"detail": message}``. That is the
body an ``HTTPException`` gives, so a rule moved out of a route answers
exactly as it did inside it.
"""


class UserAdminError(Exception):
    """A change to somebody's account that may not, or cannot, be made.

    A subclass fixes ``message`` as a class attribute and is raised with
    no arguments. The two that name catalogue ids build their own words
    and hand them up.
    """

    status_code: int = 400
    message: str = "The request could not be completed"

    def __init__(self, message: str | None = None) -> None:
        if message is not None:
            self.message = message

        super().__init__(self.message)


class UsernameTaken(UserAdminError):
    message = "Username already exists"


class EmailRequired(UserAdminError):
    message = "Email is required"


class EmailTaken(UserAdminError):
    message = "Email already exists"


class PasswordTooShort(UserAdminError):
    message = "Password must be at least 8 characters"


class AccountOutOfScope(UserAdminError):
    status_code = 403
    message = "This account is outside what you may manage."


class ProfessionOutOfScope(UserAdminError):
    """A base profession the caller may not give, named by its id."""

    status_code = 403

    def __init__(self, profession: str) -> None:
        super().__init__(f"You may not give the profession {profession}.")


class CompetenciesOutOfScope(UserAdminError):
    """Competencies the caller may not grant or remove, named by id."""

    status_code = 403

    def __init__(self, refused: list[str]) -> None:
        super().__init__(
            "You may not grant or remove: " + ", ".join(refused) + "."
        )


class PlatformRoleNotAllowed(UserAdminError):
    status_code = 403
    message = "You may not set a platform role."


class SelfGranting(UserAdminError):
    status_code = 403
    message = (
        "Competencies and platform role must be changed by another user "
        "who holds manage_users"
    )
