# backend/app/schemas/org_units.py
"""Request and response shapes for the org_unit surface.

One surface for every place, because there is one table of them. An
organisation is a place with no parent, a ward is a place inside one, and
the only thing that says which is the ``type``.

The two older surfaces — ``/api/organisations`` and ``/api/sites`` — stay
until the frontend has moved across, then go. They answer in
*organisation* ids and *site* ids respectively; everything here answers in
place ids, which is what makes them different surfaces rather than one
surface with two names.
"""

from pydantic import BaseModel, ConfigDict


class CreateOrgUnitIn(BaseModel):
    """Request to create a place.

    Attributes:
        name: What it is called.
        type: One of the types in ``shared/org-unit-types.yaml``.
        parent_id: The place it sits inside, or None for the top of a
            tree. Whether None is allowed comes from the type: a type that
            requires a parent may not be a root, and a type that does not
            may not have one.
        location: Free text, optional.
    """

    model_config = ConfigDict(extra="forbid")

    name: str
    type: str
    parent_id: int | None = None
    location: str | None = None


class UpdateOrgUnitIn(BaseModel):
    """Request to change a place. Only the fields given are changed.

    Attributes:
        name: New name.
        type: New type.
        parent_id: Where it sits. Refused if it would put the place
            inside itself.
        location: New location.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    type: str | None = None
    parent_id: int | None = None
    location: str | None = None


class ToggleOrgUnitActiveIn(BaseModel):
    """Request to activate or deactivate a place.

    Attributes:
        is_active: Whether it is in use.
    """

    model_config = ConfigDict(extra="forbid")

    is_active: bool


class OrgUnitItem(BaseModel):
    """One place, as it appears in a list.

    Attributes:
        id: Place ID.
        name: What it is called.
        type: Its type.
        type_display_name: What a person is shown for the type.
        is_root: Whether it is the top of a tree — an organisation.
            Declared by the type, never inferred from having no parent.
        parent_id: The place it sits inside, or None.
        location: Free text, possibly empty.
        is_active: Whether it is in use.
        created_at: ISO timestamp when created.
        updated_at: ISO timestamp when last changed.
    """

    id: int
    name: str
    type: str
    type_display_name: str
    is_root: bool
    parent_id: int | None
    location: str
    is_active: bool
    created_at: str
    updated_at: str


class OrgUnitsListOut(BaseModel):
    """A list of places.

    Attributes:
        org_units: The places, by name.
    """

    org_units: list[OrgUnitItem]


class OrgUnitMemberItem(BaseModel):
    """Somebody at a place, and in what capacity.

    Attributes:
        id: User ID.
        username: Their username.
        email: Their email address.
        full_name: Their name, possibly empty.
        capacity: What they are here — staff, trainee, external, patient.
    """

    id: int
    username: str
    email: str
    full_name: str
    capacity: str


class OrgUnitMembersOut(BaseModel):
    """Everybody at a place.

    Attributes:
        members: The people, by username.
    """

    members: list[OrgUnitMemberItem]


class AddOrgUnitMemberIn(BaseModel):
    """Request to record that somebody is at a place.

    Attributes:
        user_id: The person.
        capacity: What they are here. Defaults to the narrower value.
        base_profession: A profession to move them to, optional.
        additional_competencies: Competencies to grant on top, optional.
    """

    model_config = ConfigDict(extra="forbid")

    user_id: int
    capacity: str = "trainee"
    base_profession: str | None = None
    additional_competencies: list[str] | None = None


class OrgUnitChildItem(BaseModel):
    """A place directly inside another.

    Attributes:
        id: Place ID.
        name: What it is called.
        type: Its type.
        is_active: Whether it is in use.
        clinical_lead_id: Who holds its clinical lead post, or None when
            the post is vacant.
        clinical_lead_name: That person's name, so a list of places can be
            read without a second request per row. Empty when the post is
            vacant, which is a real state and not a missing value.
    """

    id: int
    name: str
    type: str
    is_active: bool
    clinical_lead_id: int | None = None
    clinical_lead_name: str = ""


class OrgUnitDetailOut(BaseModel):
    """One place and what hangs off it.

    Attributes:
        id: Place ID.
        name: What it is called.
        type: Its type.
        type_display_name: What a person is shown for the type.
        is_root: Whether it is the top of a tree.
        parent_id: The place it sits inside, or None.
        location: Free text, possibly empty.
        is_active: Whether it is in use.
        created_at: ISO timestamp when created.
        updated_at: ISO timestamp when last changed.
        members: Who is here.
        children: The places directly inside this one.
        features: Feature keys enabled here. Only the top of a tree
            carries any.
        patient_ids: The patients this place is responsible for. Only the
            top of a tree carries any.
        clinical_lead_id: Who holds the clinical lead post here, or None
            when it is vacant. Read this rather than scanning members: the
            post is the source of truth, and a vacancy is a real state a
            missing person cannot express.
    """

    id: int
    name: str
    type: str
    type_display_name: str
    is_root: bool
    parent_id: int | None
    location: str
    is_active: bool
    created_at: str
    updated_at: str
    members: list[OrgUnitMemberItem]
    children: list[OrgUnitChildItem]
    features: list[str]
    patient_ids: list[str]
    clinical_lead_id: int | None = None


class OrgUnitFeatureItem(BaseModel):
    """A feature enabled at a place.

    Attributes:
        feature_key: Which feature.
        enabled_at: ISO timestamp when it was switched on, if known.
        enabled_by: Who switched it on, if still known.
    """

    feature_key: str
    enabled_at: str | None = None
    enabled_by: int | None = None


class OrgUnitFeaturesOut(BaseModel):
    """Every feature enabled at a place.

    Attributes:
        features: The features.
    """

    features: list[OrgUnitFeatureItem]


class ToggleOrgUnitFeatureIn(BaseModel):
    """Request to switch a feature on or off at a place.

    Attributes:
        enabled: Whether the feature should be on.
    """

    model_config = ConfigDict(extra="forbid")

    enabled: bool


class AddOrgUnitPatientIn(BaseModel):
    """Request to record that a place is responsible for a patient.

    Attributes:
        patient_id: FHIR Patient resource ID.
    """

    model_config = ConfigDict(extra="forbid")

    patient_id: str


class OrgUnitStatusOut(BaseModel):
    """What happened.

    Attributes:
        status: A short word naming the outcome.
    """

    status: str


class SetClinicalLeadIn(BaseModel):
    """Request to name a place's clinical lead, or leave the post vacant.

    Attributes:
        user_id: Who holds the post, or None to vacate it. A vacancy is a
            real state and an actionable one — somebody has to be found —
            so it is said out loud rather than expressed by an absence.
    """

    model_config = ConfigDict(extra="forbid")

    user_id: int | None = None
