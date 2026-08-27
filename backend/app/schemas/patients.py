"""Pydantic schemas for patient, FHIR, and EHRbase-backed API endpoints.

Request and response models for patient verification, demographics,
clinical letters, external access grants, and the FHIR ``Patient``
resource itself.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

# ---------------------------------------------------------------------------
# FHIR Patient resource
# ---------------------------------------------------------------------------


class FhirHumanName(BaseModel):
    """A FHIR ``HumanName`` element.

    Attributes:
        use: Name usage code (e.g. "official").
        given: Given/first name(s).
        family: Family/surname.
    """

    use: str | None = None
    given: list[str] | None = None
    family: str | None = None


class FhirAddress(BaseModel):
    """A FHIR ``Address`` element.

    Attributes:
        line: Street address line(s).
        city: City/town.
        state: State/county.
        postalCode: Postal/ZIP code.
        country: Country.
    """

    line: list[str] | None = None
    city: str | None = None
    state: str | None = None
    postalCode: str | None = None
    country: str | None = None


class FhirContactPoint(BaseModel):
    """A FHIR ``ContactPoint`` element (telecom entry).

    Attributes:
        system: Contact type (e.g. "phone", "email").
        value: The contact value itself.
    """

    system: str | None = None
    value: str | None = None


class FhirIdentifier(BaseModel):
    """A FHIR ``Identifier`` element.

    Attributes:
        system: URI identifying the identifier's namespace (e.g. NHS
            number, MRN).
        value: The identifier value.
    """

    system: str | None = None
    value: str | None = None


class FhirPatientResource(BaseModel):
    """A FHIR R4 ``Patient`` resource, as returned by the HAPI FHIR server.

    Models the fields Quill actually sets or reads (see
    ``app/fhir_client.py``) rather than the full FHIR Patient
    specification. ``extra="allow"`` preserves any other fields the FHIR
    server returns (``meta``, ``text``, ``communication``, etc.) so
    nothing is silently dropped for fields not modelled here.

    Attributes:
        resourceType: Always "Patient".
        id: FHIR resource ID.
        active: Whether the resource is marked active.
        name: Patient name(s).
        telecom: Contact points (phone, email).
        gender: One of male/female/other/unknown.
        birthDate: Date of birth (YYYY-MM-DD).
        address: Patient address(es).
        identifier: External identifiers (NHS number, MRN, etc.).
        extension: FHIR extensions (e.g. the avatar gradient index).
    """

    model_config = ConfigDict(extra="allow")

    resourceType: str | None = None
    id: str | None = None
    active: bool | None = None
    name: list[FhirHumanName] | None = None
    telecom: list[FhirContactPoint] | None = None
    gender: str | None = None
    birthDate: str | None = None
    address: list[FhirAddress] | None = None
    identifier: list[FhirIdentifier] | None = None
    extension: list[dict[str, Any]] | None = None


class PatientListItem(FhirPatientResource):
    """A FHIR Patient resource enriched with Quill's activation status.

    Attributes:
        is_active: Whether the patient is active per Quill's own
            ``PatientMetadata`` record (independent of the FHIR
            resource's own ``active`` field).
    """

    is_active: bool


# ---------------------------------------------------------------------------
# Patient verification / listing
# ---------------------------------------------------------------------------


class PatientVerifyOut(BaseModel):
    """Patient verification response.

    Attributes:
        patient_id: The verified FHIR Patient resource ID.
        status: Always "ready".
    """

    patient_id: str
    status: Literal["ready"]


class PatientsListOut(BaseModel):
    """List patients response.

    Attributes:
        patients: Patients visible to the current user.
        fhir_ready: Whether the FHIR server was reachable.
    """

    patients: list[PatientListItem]
    fhir_ready: bool


# ---------------------------------------------------------------------------
# Demographics
# ---------------------------------------------------------------------------


class DemographicsAddressIn(BaseModel):
    """Address fields accepted by the demographics upsert endpoint."""

    model_config = ConfigDict(extra="forbid")

    line: list[str] | None = None
    city: str | None = None
    state: str | None = None
    postalCode: str | None = None
    country: str | None = None


class DemographicsContactIn(BaseModel):
    """Contact fields accepted by the demographics upsert endpoint."""

    model_config = ConfigDict(extra="forbid")

    phone: str | None = None
    email: str | None = None


class DemographicsIn(BaseModel):
    """Demographics upsert request payload.

    Mirrors the specific, fixed set of keys ``update_fhir_patient``
    actually reads (``app/fhir_client.py``) — not an arbitrary FHIR
    resource fragment, despite this endpoint's original docstring.

    Attributes:
        given_name: Patient's first/given name.
        family_name: Patient's family/surname.
        date_of_birth: Date of birth (ISO date string).
        sex: One of male/female/other/unknown.
        address: Address fields.
        contact: Phone/email contact fields.
    """

    model_config = ConfigDict(extra="forbid")

    given_name: str | None = None
    family_name: str | None = None
    date_of_birth: str | None = None
    sex: str | None = None
    address: DemographicsAddressIn | None = None
    contact: DemographicsContactIn | None = None


class DemographicsUpsertOut(BaseModel):
    """Demographics upsert response.

    Attributes:
        patient_id: The updated patient's FHIR resource ID.
        updated: Always True on success.
        data: The complete updated FHIR Patient resource.
    """

    patient_id: str
    updated: bool
    data: FhirPatientResource


class DemographicsOut(BaseModel):
    """Demographics retrieval response.

    Attributes:
        patient_id: The requested patient's FHIR resource ID.
        data: The complete FHIR Patient resource.
    """

    patient_id: str
    data: FhirPatientResource


# ---------------------------------------------------------------------------
# Clinical letters
# ---------------------------------------------------------------------------


class LetterCreateOut(BaseModel):
    """Letter creation response.

    Attributes:
        patient_id: The patient ID the letter belongs to.
        composition_uid: OpenEHR composition UID for retrieval, if the
            EHRbase response included one.
        title: The letter's title.
    """

    patient_id: str
    composition_uid: str | None
    title: str


class LetterOut(BaseModel):
    """Single letter retrieval response.

    Attributes:
        patient_id: The patient ID the letter belongs to.
        composition_uid: The OpenEHR composition UID.
        data: The complete OpenEHR Composition structure — left dynamic
            since it mirrors an arbitrary openEHR archetype, not a fixed
            Quill-defined shape.
    """

    patient_id: str
    composition_uid: str
    data: dict[str, Any]


class LettersListOut(BaseModel):
    """Letter list response.

    Attributes:
        patient_id: The patient ID letters were listed for.
        letters: Letter metadata rows from the EHRbase AQL query — left
            dynamic since the row shape depends on the AQL response
            format.
    """

    patient_id: str
    letters: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Patient metadata / activation
# ---------------------------------------------------------------------------


class PatientMetadataOut(BaseModel):
    """Patient metadata response.

    Attributes:
        patient_id: FHIR Patient resource ID.
        is_active: Whether the patient is active in the system.
    """

    patient_id: str
    is_active: bool


class PatientActivationOut(BaseModel):
    """Patient activate/deactivate response.

    Attributes:
        patient_id: The affected patient's FHIR resource ID.
        is_active: The patient's new activation status.
        message: Human-readable confirmation message.
    """

    patient_id: str
    is_active: bool
    message: str


# ---------------------------------------------------------------------------
# Shared organisations
# ---------------------------------------------------------------------------


class SharedOrganisationSummary(BaseModel):
    """Organisation summary for the shared-organisations endpoint.

    Attributes:
        id: Organisation ID.
        name: Organisation name.
        type: Organisation type.
    """

    id: int
    name: str
    type: str


class SharedOrganisationsOut(BaseModel):
    """Shared organisations response.

    Attributes:
        organisations: Organisations shared between the current user and
            the patient.
    """

    organisations: list[SharedOrganisationSummary]


# ---------------------------------------------------------------------------
# External access (invite / accept / revoke)
# ---------------------------------------------------------------------------


class InviteExternalOut(BaseModel):
    """External invite creation response.

    Attributes:
        invite_url: Relative URL the invitee should visit.
        token: The signed invite JWT.
    """

    invite_url: str
    token: str


class AcceptInviteOut(BaseModel):
    """Accept-invite response.

    Attributes:
        status: "access_granted" for an existing user, "registered" for
            a newly created one.
        user_id: The core DB user ID granted access.
    """

    status: Literal["access_granted", "registered"]
    user_id: int


class RevokeAccessOut(BaseModel):
    """External access revocation response."""

    status: Literal["revoked"]


class ExternalAccessGrant(BaseModel):
    """A single external access grant.

    Attributes:
        user_id: Core DB user ID of the grantee.
        username: Grantee's username.
        email: Grantee's email.
        user_type: Grantee's system permission level.
        granted_at: ISO-8601 timestamp the grant was created.
        access_level: Access level (e.g. "full").
    """

    user_id: int
    username: str
    email: str
    user_type: str
    granted_at: str
    access_level: str


class ExternalAccessListOut(BaseModel):
    """External access grants list response."""

    grants: list[ExternalAccessGrant]
