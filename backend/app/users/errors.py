"""Why a change to somebody's account was refused.

The same shape as ``MessagingError`` in :mod:`app.messaging`. Each
refusal is a class that fixes its own words and status, so nothing can
reach a caller that somebody did not write for them to read.

All but three take no arguments. Two name catalogue ids:
:class:`CompetenciesOutOfScope` lists competency ids from
``shared/competency-definitions/``, and :class:`ProfessionOutOfScope`
names one base profession id from ``shared/base-professions.yaml``.
Those are identifiers the catalogue defines, not free text. The
profession id is checked against the catalogue as the request is read.
A competency id is either one the request named, checked the same way,
or one the person's own grant rows hold, which is the single place an
id comes from the database: it is still a catalogue id, and it is what
the caller is being told they may not remove.

The third, :class:`PlaceNotFound`, repeats an org unit id the caller
sent in the request, as an integer. It is the caller's own number handed
back to them, and it is never looked up to build the words: the refusal
reads the same whether or not an org unit has that id.

Nothing else may be passed: no account id, no query, no name, and
nothing a person typed.

``app.main`` registers one handler for :class:`UserAdminError`, which
answers with the class's status and ``{"detail": message}``. That is the
body an ``HTTPException`` gives, so a rule moved out of a route answers
exactly as it did inside it.
"""


class UserAdminError(Exception):
    """A change to somebody's account that may not, or cannot, be made.

    A subclass fixes ``message`` as a class attribute and is raised with
    no arguments. The two that name catalogue ids, and the one that
    repeats an org unit id from the request, build their own words and
    hand them up.
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


class SuperadminRoleNotAllowed(UserAdminError):
    status_code = 403
    message = "Cannot grant the superadmin platform role"


class SelfGranting(UserAdminError):
    status_code = 403
    message = (
        "Competencies and platform role must be changed by another user "
        "who holds manage_users"
    )


class PlaceNotFound(UserAdminError):
    """An org unit the caller named that is not theirs to place people in.

    Takes the id as the caller sent it. The words are the same whether
    no org unit has that id or one does outside the caller's reach, so
    the answer never confirms that an org unit exists to somebody who
    cannot see it.
    """

    status_code = 404

    def __init__(self, org_unit_id: int) -> None:
        super().__init__(f"Place {org_unit_id} not found")
