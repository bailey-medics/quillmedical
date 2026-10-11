"""The words and the status each org unit refusal carries."""

import pytest

from app.org_units.errors import (
    CompetenciesOutOfScope,
    CompetencyNotHeld,
    MemberNotFound,
    NobodyPractisesHere,
    OrgUnitError,
    OrgUnitNotFound,
    UserNotFound,
)


@pytest.mark.parametrize(
    ("raised", "status_code", "message"),
    [
        (OrgUnitNotFound(), 404, "Place not found"),
        (MemberNotFound(), 404, "Member not found"),
        (UserNotFound(), 404, "User not found"),
        (
            CompetenciesOutOfScope(["manage_users", "sign_documents"]),
            403,
            "You may not grant or remove: manage_users, sign_documents.",
        ),
        (
            NobodyPractisesHere("room"),
            422,
            "Nobody practises anything at a room.",
        ),
        (
            CompetencyNotHeld("perform_venepuncture"),
            422,
            "They do not hold perform_venepuncture, so it cannot be "
            "authorised here. Grant it to them first.",
        ),
    ],
)
def test_each_refusal_says_what_the_route_always_said(
    raised: OrgUnitError, status_code: int, message: str
) -> None:
    """The words and the status a caller got before the rule moved here."""
    assert raised.status_code == status_code
    assert raised.message == message
    assert str(raised) == message


def test_a_refusal_with_no_words_of_its_own_has_the_plain_ones() -> None:
    assert OrgUnitError().status_code == 400
    assert OrgUnitError().message == "The request could not be completed"


def test_a_refusal_naming_an_id_leaves_the_others_their_own_words() -> None:
    """The words built for one refusal are its own, not the class's."""
    NobodyPractisesHere("room")

    assert NobodyPractisesHere("bed").message == (
        "Nobody practises anything at a bed."
    )
    assert OrgUnitError().message == "The request could not be completed"
