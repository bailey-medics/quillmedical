"""Why something asked of a passport was refused.

The same shape as ``OrgUnitError`` in :mod:`app.org_units.errors`. Each
refusal is a class that fixes its own words and status, so nothing can
reach a caller that somebody did not write for them to read.

The refusals here are those of asking for a sign-off and of accepting
the invitation an ask sends. The rest of the passport's rules raise
exceptions of their own with no status, such as ``SignOffError`` in
:mod:`.service`, which the router turns into an answer one route at a
time. That suits a rule about the record. These are rules about who is
let in, each with a status of its own, and a route that caught each one
to restate its status would be as long as the route the rule came out
of.

All but one take no arguments. :class:`AskedTooOftenToday` repeats the
most a holder may ask in a day: a whole number fixed in the code, which
the route hands to the rule and the rule hands back. It is not read from
the request, the store or the database.

:class:`UnknownRegisteringBody` lists a whole vocabulary, the
registering bodies the jurisdiction names, the same every time and fixed
when the module is read. It does not repeat what the caller sent.

Nothing else may be passed: no address, no name, no username, no
passport id, and nothing read from the store or from a token.

``app.main`` registers one handler for :class:`PassportError`, which
answers with the class's status and ``{"detail": message}``. That is the
body an ``HTTPException`` gives, so a rule moved out of a route answers
exactly as it did inside it.
"""

from app.registrations import REGISTRATION_AUTHORITIES


class PassportError(Exception):
    """Something asked of a passport that may not, or cannot, be done.

    A subclass fixes ``message`` as a class attribute and is raised with
    no arguments. The one that repeats the daily limit builds its own
    words and hands them up.
    """

    status_code: int = 400
    message: str = "The request could not be completed"

    def __init__(self, message: str | None = None) -> None:
        if message is not None:
            self.message = message

        super().__init__(self.message)


# --- asking for a sign-off --------------------------------------------------


class AskingYourself(PassportError):
    message = "You cannot ask yourself to sign off your own competency."


class AskedTooOftenToday(PassportError):
    """A holder who has asked as many people as a day allows."""

    status_code = 429

    def __init__(self, limit: int) -> None:
        super().__init__(
            f"You can ask up to {limit} assessors a day. Try again tomorrow."
        )


class HolderBelongsNowhere(PassportError):
    """A holder at no org unit, asking somebody who has an account.

    Said to the holder. :class:`InviterBelongsNowhere` says the same
    thing to somebody accepting an invitation.
    """

    status_code = 409
    message = (
        "You do not belong anywhere on Quill, so your assessor "
        "cannot be given access to your request."
    )


# --- accepting an invitation ------------------------------------------------


class InviteNotValid(PassportError):
    """A token that does not name an invitation that can still be used.

    One refusal for three reasons, in the same words: the token cannot
    be read or has run out, it names no invitation, or the invitation's
    own thirty days have passed. A caller holding a bad token learns only
    that it is bad, never whether a given invitation exists.
    """

    message = "This invitation link is not valid or has expired."


class InviteNoLongerValid(PassportError):
    """An invitation to a passport that is no longer there."""

    message = "This invitation is no longer valid."


class InviterBelongsNowhere(PassportError):
    """An invitation from a holder who is at no org unit.

    Nothing can be worked out then, and inventing an org unit to put
    the assessor in would be worse than saying so.
    """

    status_code = 409
    message = (
        "The clinician who invited you does not belong anywhere on "
        "Quill, so there is nowhere to add you."
    )


class InviteAlreadyAccepted(PassportError):
    status_code = 409
    message = (
        "This invitation has already been accepted. Please sign in instead."
    )


class AccountDetailsNeeded(PassportError):
    status_code = 422
    message = "A username and password are needed to create your account."


class PasswordTooShort(PassportError):
    message = "Password must be at least 8 characters"


class FullNameNeeded(PassportError):
    status_code = 422
    message = "Your full name is needed to create your account."


class RegistrationNeeded(PassportError):
    status_code = 422
    message = (
        "Your registering body and registration number are "
        "needed to create your account."
    )


class UnknownRegisteringBody(PassportError):
    """A registering body the jurisdiction does not list.

    The words list the ones it does.
    """

    status_code = 422
    message = (
        "That registering body is not one Quill recognises. "
        "Choose one of: " + ", ".join(REGISTRATION_AUTHORITIES) + "."
    )


class UsernameTaken(PassportError):
    status_code = 409
    message = "That username is already taken."
