"""Request bodies for the user administration routes.

Moved out of ``main.py`` on 12 October 2026, as they were.
"""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.cbac.base_professions import PROFESSION_IDS
from app.cbac.competencies import (
    validate_competency_ids,
)
from app.models import (
    validate_platform_role,
)
from app.schemas.limits import (
    MAX_EMAIL,
    MAX_FULL_NAME,
    MAX_PASSWORD,
    MAX_USERNAME,
)


class TeachingModuleIn(BaseModel):
    """One teaching module somebody is to be enrolled on.

    Attributes:
        module_id: The module.
        ends_on: When the enrolment stops counting, or None for no end.
    """

    model_config = {"extra": "forbid"}

    module_id: str = Field(max_length=255, pattern=r"^[a-zA-Z0-9_-]+$")
    ends_on: datetime | None = None


class TeachingEnrolmentsAtIn(BaseModel):
    """Somebody's teaching enrolments at one organisation, from the user form.

    The whole answer for that organisation: the modules listed are
    enrolled on, and one they are on and is not listed has its enrolment
    ended. An organisation that is not sent is not touched.

    Attributes:
        org_unit_id: The organisation serving the modules.
        modules: The modules they are to be enrolled on there.
    """

    model_config = {"extra": "forbid"}

    org_unit_id: int
    modules: list[TeachingModuleIn] = Field(
        default_factory=list, max_length=100
    )

    @field_validator("modules")
    @classmethod
    def _each_module_once(
        cls, value: list[TeachingModuleIn]
    ) -> list[TeachingModuleIn]:
        ids = [entry.module_id for entry in value]

        if len(ids) != len(set(ids)):
            raise ValueError("Each module may be named once.")

        return value


def _one_entry_per_organisation(
    value: list[TeachingEnrolmentsAtIn] | None,
) -> list[TeachingEnrolmentsAtIn] | None:
    """Reject a list naming one organisation twice.

    Each entry is the whole answer for its organisation, so two for the
    same one would contradict each other.
    """
    if value is None:
        return None

    ids = [entry.org_unit_id for entry in value]

    if len(ids) != len(set(ids)):
        raise ValueError("Each organisation may be named once.")

    return value


class PractisingAtIn(BaseModel):
    """What somebody may practise at one org_unit, as the user form sends it.

    The whole answer for that org_unit, for the competencies the person
    holds: the ones listed are authorised there and the ones they hold
    and are not listed are withdrawn. An org_unit that is not sent is
    not touched.

    Attributes:
        org_unit_id: The org_unit.
        competencies: What they may practise there.
    """

    model_config = {"extra": "forbid"}

    org_unit_id: int
    competencies: list[str] = []

    @field_validator("competencies")
    @classmethod
    def _competencies_exist(cls, value: list[str]) -> list[str]:
        """Reject a competency id that is not in the catalogue.

        A misspelt one would otherwise be written as a row that
        authorises nothing, and look like a decision somebody made.
        """
        return validate_competency_ids(value)


def _one_entry_per_org_unit(
    value: list[PractisingAtIn] | None,
) -> list[PractisingAtIn] | None:
    """Refuse a practice list naming the same org_unit twice.

    Each entry is the whole answer for its org_unit, so two for one
    org_unit are two answers, and the second would undo the first.
    """
    if value is None:
        return None

    seen: set[int] = set()

    for entry in value:
        if entry.org_unit_id in seen:
            raise ValueError(
                f"Place {entry.org_unit_id} is listed more than once."
            )
        seen.add(entry.org_unit_id)

    return value


class AdminUserCreateIn(BaseModel):
    """Admin User Creation Request.

    Request model for administrators to create new users with full CBAC settings.
    Requires the ``manage_users`` competency and a shared organisation
    with the patient.

    Attributes:
        name: User's full name (stored as username if username not provided).
        username: Unique username for login.
        email: Unique email address.
        password: Plain text password (will be hashed).
        base_profession: Base profession template (e.g., "consultant", "patient").
        additional_competencies: Extra competencies beyond base profession.
        removed_competencies: Competencies to remove from base profession.
        platform_role: Whether this person operates Quill itself.
        org_unit_ids: Every org_unit the person belongs to,
            organisations included, in the ids the org_units answer in.
    """

    model_config = {"extra": "forbid"}

    name: str = Field(max_length=MAX_FULL_NAME)
    username: str | None = Field(default=None, max_length=MAX_USERNAME)
    email: str = Field(max_length=MAX_EMAIL)
    password: str = Field(max_length=MAX_PASSWORD)
    base_profession: str = "patient"
    additional_competencies: list[str] = []
    removed_competencies: list[str] = []
    # Defaults to a standard account: an operator is made deliberately,
    # never by omitting a field.
    platform_role: str = "standard"
    # Nullable, as it was when it arrived beside place_ids. Tightening
    # it to a bare list would refuse an explicit null a caller may still
    # be sending, which is a second breaking change for no gain.
    org_unit_ids: list[int] | None = None
    # What they may practise at each org_unit. Absent means "say nothing
    # about practice", which is what a client built before the field
    # sends, and it leaves a new account authorised nowhere.
    practising: list[PractisingAtIn] | None = None
    # Their teaching enrolments at each organisation sent. Absent leaves
    # every enrolment as it is, as does an organisation left out.
    teaching_enrolments: list[TeachingEnrolmentsAtIn] | None = None

    @field_validator("teaching_enrolments")
    @classmethod
    def _enrolments_once_each(
        cls, value: list[TeachingEnrolmentsAtIn] | None
    ) -> list[TeachingEnrolmentsAtIn] | None:
        return _one_entry_per_organisation(value)

    @field_validator("practising")
    @classmethod
    def _practising_once_each(
        cls, value: list[PractisingAtIn] | None
    ) -> list[PractisingAtIn] | None:
        return _one_entry_per_org_unit(value)

    @field_validator("platform_role")
    @classmethod
    def _platform_role_known(cls, value: str) -> str:
        try:
            return validate_platform_role(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("additional_competencies", "removed_competencies")
    @classmethod
    def _competencies_exist(cls, value: list[str] | None) -> list[str] | None:
        """Reject a competency id that is not in the catalogue.

        Nothing joins these strings to `shared/competency-definitions/`, so an
        unrecognised one is otherwise stored happily and shows up much
        later as a permission that never applies.
        """
        if value is None:
            return None

        return validate_competency_ids(value)

    @field_validator("base_profession")
    @classmethod
    def _profession_exists(cls, value: str | None) -> str | None:
        """Reject a base profession that is not in the catalogue.

        The same silent failure: `get_profession_base_competencies`
        returns an empty list for an unknown profession, so a typo gives
        the user no competencies at all and says nothing.
        """
        if value is None:
            return None
        if value not in PROFESSION_IDS:
            raise ValueError(
                f"Unknown base profession: {value}. Professions are "
                "defined in shared/base-professions.yaml."
            )

        return value


class AdminUserUpdateIn(BaseModel):
    """Admin User Update Input Schema.

    Pydantic model for updating existing user accounts via admin endpoints.
    All fields are optional - only provided fields will be updated.

    Attributes:
        name: Full name (optional).
        username: Unique username (optional).
        email: Email address (optional).
        password: New password (optional, only if changing).
        base_profession: Base profession ID (optional).
        additional_competencies: Competencies to add (optional).
        removed_competencies: Competencies to remove (optional).
        platform_role: Whether this person operates Quill itself (optional).
    """

    model_config = {"extra": "forbid"}

    name: str | None = Field(default=None, max_length=MAX_FULL_NAME)
    username: str | None = Field(default=None, max_length=MAX_USERNAME)
    email: str | None = Field(default=None, max_length=MAX_EMAIL)
    password: str | None = Field(default=None, max_length=MAX_PASSWORD)
    base_profession: str | None = None
    additional_competencies: list[str] | None = None
    removed_competencies: list[str] | None = None
    platform_role: str | None = None
    org_unit_ids: list[int] | None = None
    # What they may practise at each org_unit sent. Absent leaves every
    # practice row as it is, as does an org_unit left out of the list.
    practising: list[PractisingAtIn] | None = None
    # Their teaching enrolments at each organisation sent. Absent leaves
    # every enrolment as it is, as does an organisation left out.
    teaching_enrolments: list[TeachingEnrolmentsAtIn] | None = None

    @field_validator("teaching_enrolments")
    @classmethod
    def _enrolments_once_each(
        cls, value: list[TeachingEnrolmentsAtIn] | None
    ) -> list[TeachingEnrolmentsAtIn] | None:
        return _one_entry_per_organisation(value)

    @field_validator("practising")
    @classmethod
    def _practising_once_each(
        cls, value: list[PractisingAtIn] | None
    ) -> list[PractisingAtIn] | None:
        return _one_entry_per_org_unit(value)

    @field_validator("platform_role")
    @classmethod
    def _platform_role_known(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            return validate_platform_role(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("additional_competencies", "removed_competencies")
    @classmethod
    def _competencies_exist(cls, value: list[str] | None) -> list[str] | None:
        """Reject a competency id that is not in the catalogue.

        Nothing joins these strings to `shared/competency-definitions/`, so an
        unrecognised one is otherwise stored happily and shows up much
        later as a permission that never applies.
        """
        if value is None:
            return None

        return validate_competency_ids(value)

    @field_validator("base_profession")
    @classmethod
    def _profession_exists(cls, value: str | None) -> str | None:
        """Reject a base profession that is not in the catalogue.

        The same silent failure: `get_profession_base_competencies`
        returns an empty list for an unknown profession, so a typo gives
        the user no competencies at all and says nothing.
        """
        if value is None:
            return None
        if value not in PROFESSION_IDS:
            raise ValueError(
                f"Unknown base profession: {value}. Professions are "
                "defined in shared/base-professions.yaml."
            )

        return value
