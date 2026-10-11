"""The words and the status each org unit refusal carries."""

import pytest

from app.org_units.errors import (
    CannotBeClinicalLead,
    CompetenciesOutOfScope,
    CompetencyNotHeld,
    CoverNeedsAnOperator,
    CoverNeedsThePassport,
    FeatureForOrganisationsOnly,
    GrantingNotAllowed,
    GrantingToYourself,
    InsideItself,
    LinkedToItself,
    LinkTargetNotFound,
    MemberNotFound,
    NeedsAParent,
    NobodyBelongsHere,
    NobodyLeadsHere,
    NobodyPractisesHere,
    NotAtThisPlace,
    OperatorAccountNotAllowed,
    OperatorOnly,
    OrganisationNeedsManageUsers,
    OrgUnitError,
    OrgUnitNotFound,
    SiteInsideASite,
    TopOfATree,
    TypeWouldMoveIt,
    UnknownCapacity,
    UnknownOrgUnitType,
    UnknownRelation,
    UserNotFound,
)
from app.org_units.relations import ORG_UNIT_RELATION_IDS
from app.org_units.types import ORG_UNIT_TYPE_IDS


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


@pytest.mark.parametrize(
    ("raised", "status_code", "message"),
    [
        (
            NeedsAParent("site"),
            422,
            "A site sits inside something. Name the place it belongs to.",
        ),
        (
            TopOfATree("organisation"),
            422,
            "A organisation is the top of a tree and does not sit inside "
            "anything.",
        ),
        (OperatorOnly(), 403, "Requires superadmin permissions"),
        (
            SiteInsideASite(),
            422,
            "A site sits directly inside an organisation, not inside "
            "another site.",
        ),
        (
            OrganisationNeedsManageUsers(),
            403,
            "Editing an organisation requires manage_users.",
        ),
        (
            TypeWouldMoveIt(),
            422,
            "That type would change whether this place sits inside "
            "another. Move it first, or create a new one.",
        ),
        (InsideItself(), 400, "A place cannot sit inside itself"),
        (NobodyBelongsHere("room"), 422, "Nobody belongs to a room."),
        (
            UnknownCapacity(),
            422,
            "Unknown capacity. Must be one of: staff, trainee, external, "
            "patient",
        ),
        (NobodyLeadsHere("room"), 422, "Nobody is clinical lead of a room."),
        (NotAtThisPlace(), 422, "That person is not at this place."),
        (
            CannotBeClinicalLead(),
            409,
            "That person cannot be made clinical lead here.",
        ),
        (GrantingNotAllowed(), 403, "Not allowed"),
        (OperatorAccountNotAllowed(), 403, "Cannot modify superadmin users"),
        (
            GrantingToYourself(),
            403,
            "Competencies must be changed by another user who holds "
            "manage_users",
        ),
        (
            CoverNeedsAnOperator(),
            403,
            "Only an operator may switch passport cover.",
        ),
        (
            FeatureForOrganisationsOnly(),
            422,
            "That feature is switched on for an organisation, and reaches "
            "its sites from there.",
        ),
        (
            CoverNeedsThePassport(),
            422,
            "Switch the passport on here before its cover.",
        ),
        (LinkedToItself(), 400, "A place cannot be linked to itself"),
        (LinkTargetNotFound(), 404, "Target place not found"),
    ],
)
def test_each_refusal_moved_later_says_what_its_route_always_said(
    raised: OrgUnitError, status_code: int, message: str
) -> None:
    """The words and the status a caller got before the rule moved here."""
    assert raised.status_code == status_code
    assert raised.message == message
    assert str(raised) == message


def test_an_unknown_type_is_answered_with_every_type_there_is() -> None:
    assert UnknownOrgUnitType().status_code == 422
    assert UnknownOrgUnitType().message == (
        "Unknown kind of place. Must be one of: "
        + ", ".join(ORG_UNIT_TYPE_IDS)
    )
    assert "organisation, " in UnknownOrgUnitType().message


def test_an_unknown_relation_is_answered_with_every_relation_there_is() -> (
    None
):
    assert UnknownRelation().status_code == 400
    assert UnknownRelation().message == (
        "Invalid relation. Must be one of: " + ", ".join(ORG_UNIT_RELATION_IDS)
    )
    assert "teaches_at" in UnknownRelation().message
