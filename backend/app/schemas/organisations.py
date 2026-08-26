"""Pydantic schemas for organisations and sites API endpoints.

This module defines request and response models for managing organisations,
sites, staff assignments, and feature toggles.
"""

from pydantic import BaseModel, ConfigDict

# === Organisations: Request Models ===


class CreateOrganisationIn(BaseModel):
    """Request to create a new organisation.

    Attributes:
        name: Organisation name (required).
        type: Organisation type (hospital_team, gp_practice, private_clinic, department, teaching_establishment).
        location: Physical location (optional).
    """

    model_config = ConfigDict(extra="forbid")

    name: str
    type: str
    location: str | None = None


class UpdateOrganisationIn(BaseModel):
    """Request to update an organisation.

    All fields are optional; only provided fields are updated.

    Attributes:
        name: Updated organisation name.
        type: Updated organisation type.
        location: Updated location.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    type: str | None = None
    location: str | None = None


class AddStaffIn(BaseModel):
    """Request to add staff to an organisation.

    Attributes:
        user_id: ID of the user to add as staff.
    """

    model_config = ConfigDict(extra="forbid")

    user_id: int


class AddPatientIn(BaseModel):
    """Request to add patient to an organisation.

    Attributes:
        patient_id: FHIR patient ID to add.
    """

    model_config = ConfigDict(extra="forbid")

    patient_id: str


# === Organisations: Response Models ===


class OrganisationOut(BaseModel):
    """Organisation summary response.

    Basic organisation details returned by create, update, and delete operations.

    Attributes:
        id: Organisation ID.
        name: Organisation name.
        type: Organisation type.
        location: Physical location (may be null).
        created_at: ISO timestamp when created.
        updated_at: ISO timestamp when last updated.
    """

    id: int
    name: str
    type: str
    location: str | None
    created_at: str
    updated_at: str


class OrganisationListItem(BaseModel):
    """Organisation summary for list context.

    Attributes:
        id: Organisation ID.
        name: Organisation name.
        type: Organisation type.
        location: Physical location (may be null).
        created_at: ISO timestamp when created.
        updated_at: ISO timestamp when last updated.
    """

    id: int
    name: str
    type: str
    location: str | None
    created_at: str
    updated_at: str


class OrganisationsListOut(BaseModel):
    """List organisations response.

    Attributes:
        organisations: List of organisation summaries.
    """

    organisations: list[OrganisationListItem]


class StaffMemberItem(BaseModel):
    """Staff member in an organisation.

    Attributes:
        id: Staff member (user) ID.
        username: Staff member's username.
        email: Staff member's email.
        full_name: Staff member's full name (may be empty string).
    """

    id: int
    username: str
    email: str
    full_name: str


class PatientMemberItem(BaseModel):
    """Patient member of an organisation.

    Attributes:
        patient_id: FHIR patient ID.
    """

    patient_id: str


class LinkedSiteItem(BaseModel):
    """Site linked to an organisation.

    Attributes:
        id: Site ID.
        name: Site name.
        type: Site type.
        location: Physical location (may be empty string).
        is_active: Whether site is active.
        clinical_lead: Full name or username of the clinical lead (may be empty string).
    """

    id: int
    name: str
    type: str
    location: str
    is_active: bool
    clinical_lead: str


class OrganisationDetailOut(BaseModel):
    """Detailed organisation response including related data.

    Returned by the get_organisation endpoint.

    Attributes:
        id: Organisation ID.
        name: Organisation name.
        type: Organisation type.
        location: Physical location (may be null).
        created_at: ISO timestamp when created.
        updated_at: ISO timestamp when last updated.
        staff_count: Number of staff members.
        patient_count: Number of patients.
        staff_members: List of staff members.
        patient_members: List of patient members.
        sites: List of linked sites.
    """

    id: int
    name: str
    type: str
    location: str | None
    created_at: str
    updated_at: str
    staff_count: int
    patient_count: int
    staff_members: list[StaffMemberItem]
    patient_members: list[PatientMemberItem]
    sites: list[LinkedSiteItem]


class OrgStaffAddResponse(BaseModel):
    """Response to adding staff to an organisation.

    Attributes:
        organisation_id: Organisation ID.
        user_id: User (staff) ID.
        username: Staff member's username.
    """

    organisation_id: int
    user_id: int
    username: str


class OrgPatientAddResponse(BaseModel):
    """Response to adding patient to an organisation.

    Attributes:
        organisation_id: Organisation ID.
        patient_id: FHIR patient ID.
    """

    organisation_id: int
    patient_id: str


class StatusResponse(BaseModel):
    """Generic response with a status message.

    Used for simple action responses like remove, delete, and link operations.

    Attributes:
        status: Status message (e.g. "removed", "deleted", "linked").
    """

    status: str


# === Organisation Features ===


class FeatureItem(BaseModel):
    """Organisation feature in list context.

    Attributes:
        feature_key: Feature identifier.
        enabled_at: ISO timestamp when enabled (may be null if not enabled).
        enabled_by: Username of user who enabled it (may be null).
    """

    feature_key: str
    enabled_at: str | None
    enabled_by: str | None


class FeaturesListOut(BaseModel):
    """List organisation features response.

    Attributes:
        features: List of organisation features.
    """

    features: list[FeatureItem]


class FeatureToggleResponse(BaseModel):
    """Response to toggling an organisation feature.

    Attributes:
        status: Toggle result (enabled, disabled, already_enabled, already_disabled).
    """

    status: str


# === Sites: Request Models ===


class CreateSiteIn(BaseModel):
    """Request to create a new site.

    Attributes:
        name: Site name (required).
        type: Site type (hospital, building, ward, room, clinic, department, virtual).
        parent_id: ID of parent site if this is a child site (optional).
        location: Physical location (optional).
    """

    model_config = ConfigDict(extra="forbid")

    name: str
    type: str
    parent_id: int | None = None
    location: str | None = None


class UpdateSiteIn(BaseModel):
    """Request to update a site.

    All fields are optional; only provided fields are updated.

    Attributes:
        name: Updated site name.
        type: Updated site type.
        parent_id: Updated parent site ID.
        location: Updated location.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    type: str | None = None
    parent_id: int | None = None
    location: str | None = None


class ToggleSiteActiveIn(BaseModel):
    """Request to toggle site active status.

    Attributes:
        is_active: Whether site should be active.
    """

    model_config = ConfigDict(extra="forbid")

    is_active: bool


class AddSiteStaffIn(BaseModel):
    """Request to add staff to a site.

    Attributes:
        user_id: ID of the user to add as staff.
        role: Role for this staff member (staff, trainee, clinical_lead).
    """

    model_config = ConfigDict(extra="forbid")

    user_id: int
    role: str


# === Sites: Response Models ===


class SiteOut(BaseModel):
    """Site summary response.

    Basic site details returned by create, update, and delete operations.

    Attributes:
        id: Site ID.
        name: Site name.
        type: Site type.
        parent_id: Parent site ID if this is a child site (may be null).
        location: Physical location (may be empty string).
        is_active: Whether site is active.
        created_at: ISO timestamp when created.
        updated_at: ISO timestamp when last updated.
    """

    id: int
    name: str
    type: str
    parent_id: int | None
    location: str
    is_active: bool
    created_at: str
    updated_at: str


class SiteListItem(BaseModel):
    """Site summary for list context.

    Attributes:
        id: Site ID.
        name: Site name.
        type: Site type.
        parent_id: Parent site ID if this is a child site (may be null).
        location: Physical location (may be empty string).
        is_active: Whether site is active.
        created_at: ISO timestamp when created.
        updated_at: ISO timestamp when last updated.
    """

    id: int
    name: str
    type: str
    parent_id: int | None
    location: str
    is_active: bool
    created_at: str
    updated_at: str


class SitesListOut(BaseModel):
    """List sites response.

    Attributes:
        sites: List of site summaries.
    """

    sites: list[SiteListItem]


class SiteStaffItem(BaseModel):
    """Staff member assigned to a site.

    Attributes:
        id: Staff member (user) ID.
        username: Staff member's username.
        email: Staff member's email.
        role: Role at this site (staff, trainee, clinical_lead).
        full_name: Staff member's full name (may be empty).
    """

    id: int
    username: str
    email: str
    role: str
    full_name: str


class LinkedOrganisationItem(BaseModel):
    """Organisation linked to a site.

    Attributes:
        id: Organisation ID.
        name: Organisation name.
        type: Organisation type.
    """

    id: int
    name: str
    type: str


class SiteDetailOut(BaseModel):
    """Detailed site response including related data.

    Returned by the get_site endpoint.

    Attributes:
        id: Site ID.
        name: Site name.
        type: Site type.
        parent_id: Parent site ID if this is a child site (may be null).
        location: Physical location (may be empty string).
        is_active: Whether site is active.
        created_at: ISO timestamp when created.
        updated_at: ISO timestamp when last updated.
        staff: List of staff members assigned to this site.
        organisations: List of organisations linked to this site.
    """

    id: int
    name: str
    type: str
    parent_id: int | None
    location: str
    is_active: bool
    created_at: str
    updated_at: str
    staff: list[SiteStaffItem]
    organisations: list[LinkedOrganisationItem]


class AddSiteStaffResponse(BaseModel):
    """Response to adding staff to a site.

    Attributes:
        status: Result of the operation (added or updated).
    """

    status: str
