"""Why something asked of an org unit was refused.

The same shape as ``UserAdminError`` in :mod:`app.users.errors`. Each
refusal is a class that fixes its own words and status, so nothing can
reach a caller that somebody did not write for them to read.

All but seven take no arguments. Those seven name catalogue ids:

- :class:`NobodyPractisesHere`, :class:`NobodyBelongsHere`,
  :class:`NobodyLeadsHere`, :class:`NeedsAParent` and
  :class:`TopOfATree` name an org unit type from
  ``shared/org-unit-types.yaml``. It is read from the org unit's row,
  where ``validate_org_unit_type`` checked it as it was written, or it
  is the type a request named, checked the same way before the refusal
  is made.
- :class:`CompetencyNotHeld` names one competency id from
  ``shared/competency-definitions/``, which the request model checked
  against the catalogue as the request was read.
- :class:`CompetenciesOutOfScope` lists competency ids. Where a
  competency is being granted or authorised, the request model checked
  each one the same way. **Withdrawing is the exception**: that route
  takes the id from its path and checks it against nothing, so that a
  row can always be taken away, and a caller acting through a scoped
  manager is handed back the id as they typed it.

Three more list a whole vocabulary, the same every time and fixed when
the module is read: :class:`UnknownOrgUnitType` the org unit types,
:class:`UnknownCapacity` the capacities a member may have and
:class:`UnknownRelation` the relations a link may record. None repeats
what the caller sent.

Nothing else may be passed: no account id, no org unit id, no name, and
nothing read from a person's own text.

``app.main`` registers one handler for :class:`OrgUnitError`, which
answers with the class's status and ``{"detail": message}``. That is the
body an ``HTTPException`` gives, so a rule moved out of a route answers
exactly as it did inside it.
"""

from app.models import MEMBER_CAPACITIES
from app.org_units.relations import ORG_UNIT_RELATION_IDS
from app.org_units.types import ORG_UNIT_TYPE_IDS


class OrgUnitError(Exception):
    """Something asked of an org unit that may not, or cannot, be done.

    A subclass fixes ``message`` as a class attribute and is raised with
    no arguments. The seven that name catalogue ids build their own
    words and hand them up.
    """

    status_code: int = 400
    message: str = "The request could not be completed"

    def __init__(self, message: str | None = None) -> None:
        if message is not None:
            self.message = message

        super().__init__(self.message)


class OrgUnitNotFound(OrgUnitError):
    """An org unit the caller named that is not theirs to see.

    The words are the same whether no org unit has that id or one does
    outside what the caller may see, so the answer never confirms that
    an org unit exists to somebody who may not see it.
    """

    status_code = 404
    message = "Place not found"


class MemberNotFound(OrgUnitError):
    """Somebody named who is not a member of the org unit.

    One refusal for two reasons, in the same words: nobody has that id,
    or somebody does and is not a member here. The answer does not say
    which.
    """

    status_code = 404
    message = "Member not found"


class UserNotFound(OrgUnitError):
    status_code = 404
    message = "User not found"


class CompetenciesOutOfScope(OrgUnitError):
    """Competencies the caller may not grant or remove, named by id.

    The same refusal, in the same words, as the one of this name in
    :mod:`app.users.errors`, which the people routes give.
    """

    status_code = 403

    def __init__(self, refused: list[str]) -> None:
        super().__init__(
            "You may not grant or remove: " + ", ".join(refused) + "."
        )


class NobodyPractisesHere(OrgUnitError):
    """An org unit whose type holds no competencies, named by its type."""

    status_code = 422

    def __init__(self, unit_type: str) -> None:
        super().__init__(f"Nobody practises anything at a {unit_type}.")


class CompetencyNotHeld(OrgUnitError):
    """A competency somebody does not hold, so cannot practise anywhere."""

    status_code = 422

    def __init__(self, competency: str) -> None:
        super().__init__(
            f"They do not hold {competency}, so it cannot be "
            "authorised here. Grant it to them first."
        )


# --- creating an org unit, and changing one ---------------------------------


class UnknownOrgUnitType(OrgUnitError):
    """A type nothing is. The words list the types there are.

    Written here and not taken from the exception that found it: a caught
    exception's text must not reach a client, because the next person to
    raise one may put something in it that should not travel.
    """

    status_code = 422
    message = "Unknown kind of place. Must be one of: " + ", ".join(
        ORG_UNIT_TYPE_IDS
    )


class NeedsAParent(OrgUnitError):
    """An org unit of a type that sits inside another, given no parent."""

    status_code = 422

    def __init__(self, unit_type: str) -> None:
        super().__init__(
            f"A {unit_type} sits inside something. Name the place "
            "it belongs to."
        )


class TopOfATree(OrgUnitError):
    """An org unit of a type that starts a tree, given a parent."""

    status_code = 422

    def __init__(self, unit_type: str) -> None:
        super().__init__(
            f"A {unit_type} is the top of a tree and does not sit "
            "inside anything."
        )


class OperatorOnly(OrgUnitError):
    """Something only an operator of the deployment may do."""

    status_code = 403
    message = "Requires superadmin permissions"


class SiteInsideASite(OrgUnitError):
    status_code = 422
    message = (
        "A site sits directly inside an organisation, not inside "
        "another site."
    )


class OrganisationNeedsManageUsers(OrgUnitError):
    """An organisation, edited by somebody acting through a scoped manager."""

    status_code = 403
    message = "Editing an organisation requires manage_users."


class TypeWouldMoveIt(OrgUnitError):
    """A new type that would change whether the org unit has a parent.

    From a type that sits inside another to one that starts a tree, or
    the other way about.
    """

    status_code = 422
    message = (
        "That type would change whether this place sits inside "
        "another. Move it first, or create a new one."
    )


class InsideItself(OrgUnitError):
    message = "A place cannot sit inside itself"


# --- who is here ------------------------------------------------------------


class NobodyBelongsHere(OrgUnitError):
    """An org unit whose type has no members, named by its type."""

    status_code = 422

    def __init__(self, unit_type: str) -> None:
        super().__init__(f"Nobody belongs to a {unit_type}.")


class UnknownCapacity(OrgUnitError):
    """A capacity nobody has. The words list the ones there are."""

    status_code = 422
    message = "Unknown capacity. Must be one of: " + ", ".join(
        MEMBER_CAPACITIES
    )


class NobodyLeadsHere(OrgUnitError):
    """An org unit whose type holds no positions, named by its type."""

    status_code = 422

    def __init__(self, unit_type: str) -> None:
        super().__init__(f"Nobody is clinical lead of a {unit_type}.")


class NotAtThisPlace(OrgUnitError):
    """Somebody named for a post at an org unit they are not a member of."""

    status_code = 422
    message = "That person is not at this place."


class CannotBeClinicalLead(OrgUnitError):
    """Somebody the post refused.

    It is full, or it asks for a competency they may not practise here.
    One refusal for both, in words written here.
    """

    status_code = 409
    message = "That person cannot be made clinical lead here."


# --- granting a competency to a member --------------------------------------


class GrantingNotAllowed(OrgUnitError):
    """A caller who holds nothing that lets them grant a competency."""

    status_code = 403
    message = "Not allowed"


class OperatorAccountNotAllowed(OrgUnitError):
    """An operator's account, acted on by somebody who is not one."""

    status_code = 403
    message = "Cannot modify superadmin users"


class GrantingToYourself(OrgUnitError):
    status_code = 403
    message = (
        "Competencies must be changed by another user who holds "
        "manage_users"
    )


# --- what an org unit carries -----------------------------------------------


class CoverNeedsAnOperator(OrgUnitError):
    status_code = 403
    message = "Only an operator may switch passport cover."


class FeatureForOrganisationsOnly(OrgUnitError):
    status_code = 422
    message = (
        "That feature is switched on for an organisation, "
        "and reaches its sites from there."
    )


class CoverNeedsThePassport(OrgUnitError):
    status_code = 422
    message = "Switch the passport on here before its cover."


# --- relationships that are not ownership -----------------------------------


class LinkedToItself(OrgUnitError):
    message = "A place cannot be linked to itself"


class LinkTargetNotFound(OrgUnitError):
    status_code = 404
    message = "Target place not found"


class UnknownRelation(OrgUnitError):
    """A relation no link records. The words list the ones there are."""

    message = "Invalid relation. Must be one of: " + ", ".join(
        ORG_UNIT_RELATION_IDS
    )


class OrgUnitDeactivated(OrgUnitError):
    """Somebody added to an org unit that has been deactivated."""

    status_code = 409
    message = (
        "This site has been deactivated, so nobody can be added to it. "
        "Make it active again first."
    )


class OrganisationNotDeactivatedHere(OrgUnitError):
    """An organisation, asked to be deactivated as a site is."""

    status_code = 409
    message = "Only a site is deactivated here, not an organisation."


class AlreadyDeactivated(OrgUnitError):
    """A site asked to be deactivated that already is."""

    status_code = 409
    message = "This site is already deactivated."


class DeactivateInstead(OrgUnitError):
    """A site switched off without its people being dealt with."""

    status_code = 409
    message = (
        "A site is deactivated from its edit page, which also deactivates "
        "the accounts of people who belong nowhere else."
    )
