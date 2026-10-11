"""The words and the status each passport refusal carries."""

import pytest

from app.features.passport.errors import (
    AccountDetailsNeeded,
    AskedTooOftenToday,
    AskingYourself,
    FullNameNeeded,
    HolderBelongsNowhere,
    InviteAlreadyAccepted,
    InviteNoLongerValid,
    InviteNotValid,
    InviterBelongsNowhere,
    PassportError,
    PasswordTooShort,
    RegistrationNeeded,
    UnknownRegisteringBody,
    UsernameTaken,
)
from app.registrations import REGISTRATION_AUTHORITIES


@pytest.mark.parametrize(
    ("raised", "status_code", "message"),
    [
        (
            AskingYourself(),
            400,
            "You cannot ask yourself to sign off your own competency.",
        ),
        (
            AskedTooOftenToday(100),
            429,
            "You can ask up to 100 assessors a day. Try again tomorrow.",
        ),
        (
            HolderBelongsNowhere(),
            409,
            "You do not belong anywhere on Quill, so your assessor "
            "cannot be given access to your request.",
        ),
        (
            InviteNotValid(),
            400,
            "This invitation link is not valid or has expired.",
        ),
        (InviteNoLongerValid(), 400, "This invitation is no longer valid."),
        (
            InviterBelongsNowhere(),
            409,
            "The clinician who invited you does not belong anywhere on "
            "Quill, so there is nowhere to add you.",
        ),
        (
            InviteAlreadyAccepted(),
            409,
            "This invitation has already been accepted. "
            "Please sign in instead.",
        ),
        (
            AccountDetailsNeeded(),
            422,
            "A username and password are needed to create your account.",
        ),
        (PasswordTooShort(), 400, "Password must be at least 8 characters"),
        (
            FullNameNeeded(),
            422,
            "Your full name is needed to create your account.",
        ),
        (
            RegistrationNeeded(),
            422,
            "Your registering body and registration number are "
            "needed to create your account.",
        ),
        (UsernameTaken(), 409, "That username is already taken."),
    ],
)
def test_each_refusal_says_what_the_route_always_said(
    raised: PassportError, status_code: int, message: str
) -> None:
    """The words and the status a caller got before the rule moved here."""
    assert raised.status_code == status_code
    assert raised.message == message
    assert str(raised) == message


def test_a_refusal_with_no_words_of_its_own_has_the_plain_ones() -> None:
    assert PassportError().status_code == 400
    assert PassportError().message == "The request could not be completed"


def test_the_daily_limit_is_repeated_as_the_number_it_was_given() -> None:
    assert AskedTooOftenToday(2).message == (
        "You can ask up to 2 assessors a day. Try again tomorrow."
    )


def test_a_refusal_repeating_a_limit_leaves_the_others_their_words() -> None:
    """The words built for one refusal are its own, not the class's."""
    AskedTooOftenToday(2)

    assert AskedTooOftenToday(7).message == (
        "You can ask up to 7 assessors a day. Try again tomorrow."
    )
    assert PassportError().message == "The request could not be completed"


def test_an_unknown_registering_body_lists_the_ones_there_are() -> None:
    refusal = UnknownRegisteringBody()

    assert refusal.status_code == 422
    assert refusal.message == (
        "That registering body is not one Quill recognises. "
        "Choose one of: " + ", ".join(REGISTRATION_AUTHORITIES) + "."
    )

    for authority in REGISTRATION_AUTHORITIES:
        assert authority in refusal.message
