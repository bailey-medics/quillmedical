"""The patient routes: demographics, letters, activation and external access.

Moved out of ``main.py`` on 12 October 2026, as they were: the same
addresses, guards and response models. The rules each route applies are
in ``app/patients/`` and its neighbours; a route here reads the request,
calls them, and shapes the answer.

``main.py`` includes this router under the API prefix.
"""

import logging
from datetime import UTC, datetime

from fastapi import (
    APIRouter,
    HTTPException,
)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import (
    DEP_CURRENT_USER,
    DEP_GET_SESSION,
    DEP_REQUIRE_CLINICAL,
    DEP_REQUIRE_CSRF,
    DEP_REQUIRE_MANAGE_USERS,
    DEP_REQUIRE_ROLES_CLINICIAN,
)
from app.ehrbase_client import (
    create_letter_composition,
    get_letter_composition,
    list_letters_for_patient,
)
from app.fhir_client import (
    FhirClientError,
    create_fhir_patient,
    list_fhir_patients,
    read_fhir_patient,
    update_fhir_patient,
)
from app.models import (
    ExternalPatientAccess,
    OrgUnit,
    PatientMetadata,
    User,
)
from app.organisations import (
    get_shared_org_unit_ids,
)
from app.patients.listing import patients_shown
from app.patients.update import changes_to_send
from app.schemas.auth import (
    LinkPatientIn,
    LinkPatientOut,
)
from app.schemas.letters import LetterIn
from app.schemas.messaging import (
    InviteExternalIn,
)
from app.schemas.patients import (
    DemographicsIn,
    DemographicsOut,
    DemographicsUpsertOut,
    ExternalAccessGrant,
    ExternalAccessListOut,
    FhirPatientResource,
    InviteExternalOut,
    LetterCreateOut,
    LetterOut,
    LettersListOut,
    PatientActivationOut,
    PatientMetadataOut,
    PatientsListOut,
    PatientVerifyOut,
    RevokeAccessOut,
    SharedOrganisationsOut,
    SharedOrganisationSummary,
)
from app.security import (
    create_invite_token,
)
from app.users.reach import check_account_within_reach

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/patients/verify",
    dependencies=[
        DEP_REQUIRE_CLINICAL,
        DEP_REQUIRE_ROLES_CLINICIAN,
        DEP_REQUIRE_CSRF,
    ],
    response_model=PatientVerifyOut,
)
def create_patient_record(patient_id: str) -> PatientVerifyOut:
    """Create or Verify Patient in FHIR.

    Verifies that a patient exists in the FHIR server before allowing clinical
    operations. This ensures the patient has a valid FHIR Patient resource
    before creating letters or other clinical documents. Requires Clinician
    role and CSRF token validation.

    Args:
        patient_id: FHIR Patient resource ID to verify.

    Returns:
        dict: Patient verification response with keys:
            - patient_id: The verified patient ID
            - status: "ready" indicating patient exists

    Raises:
        HTTPException: 404 if patient not found in FHIR server.
        HTTPException: 500 if FHIR communication fails.
    """
    try:
        # Check if patient exists in FHIR
        patient = read_fhir_patient(patient_id)
        if not patient:
            raise HTTPException(
                status_code=404, detail="Patient not found in FHIR server"
            )
        return PatientVerifyOut(patient_id=patient_id, status="ready")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to create patient record")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Could not create the patient record",
                "error_code": "patient_record_create_failed",
            },
        ) from e


@router.get(
    "/patients",
    dependencies=[DEP_REQUIRE_CLINICAL],
    response_model=PatientsListOut,
)
def list_patients(
    include_inactive: bool = False,
    scope: str | None = None,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> PatientsListOut:
    """List patients from FHIR, filtered by organisation membership.

    By default, staff see only patients in their organisation(s).
    Admin/superadmin can pass ``scope=admin`` to see all patients.
    External users see only patients they have ExternalPatientAccess for.

    Args:
        include_inactive: If true, include deactivated patients (admin only).
        scope: Pass "admin" to bypass org filtering (admin/superadmin only).
        current_user: Currently authenticated user.
        db: Database session.

    Returns:
        dict: Response with patients array and fhir_ready flag.
    """
    try:
        records = list_fhir_patients()
        shown = patients_shown(
            db,
            current_user,
            records,
            scope=scope,
            include_inactive=include_inactive,
        )

        return PatientsListOut(patients=shown, fhir_ready=True)
    except FhirClientError:
        raise
    except Exception:
        return PatientsListOut(patients=[], fhir_ready=False)


@router.put(
    "/patients/{patient_id}/demographics",
    dependencies=[
        DEP_REQUIRE_CLINICAL,
        DEP_REQUIRE_ROLES_CLINICIAN,
        DEP_REQUIRE_CSRF,
    ],
    response_model=DemographicsUpsertOut,
)
def upsert_demographics(
    patient_id: str,
    demographics: DemographicsIn,
    current_user: User = DEP_CURRENT_USER,
) -> DemographicsUpsertOut:
    """Update Patient Demographics in FHIR.

    Updates patient demographic information in the FHIR server. Accepts
    the fixed set of demographic fields ``update_fhir_patient`` maps onto
    the FHIR resource (given/family name, date of birth, sex, address,
    contact). Requires Clinician role and CSRF token validation since
    this modifies patient data.

    Args:
        patient_id: FHIR Patient resource ID to update.
        demographics: Demographic fields to update.
        current_user: Currently authenticated user (unused but validates auth).

    Returns:
        DemographicsUpsertOut: The updated patient ID, success flag, and
            the complete updated FHIR Patient resource.

    Raises:
        HTTPException: 404 if patient not found in FHIR server.
        HTTPException: 500 if FHIR update operation fails.
    """
    try:
        result = update_fhir_patient(
            patient_id, demographics.model_dump(exclude_none=True)
        )
        if result is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        return DemographicsUpsertOut(
            patient_id=patient_id,
            updated=True,
            data=FhirPatientResource.model_validate(result),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to upsert demographics")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Could not save the demographics",
                "error_code": "demographics_update_failed",
            },
        ) from e


@router.get(
    "/patients/{patient_id}/demographics",
    dependencies=[DEP_REQUIRE_CLINICAL],
    response_model=DemographicsOut,
)
def get_demographics(
    patient_id: str, current_user: User = DEP_CURRENT_USER
) -> DemographicsOut:
    """Get Patient Demographics from FHIR.

    Retrieves complete demographic information for a specific patient from the
    FHIR server. Returns the full FHIR R4 Patient resource including name,
    date of birth, gender, identifiers, contact information, and address.

    Args:
        patient_id: FHIR Patient resource ID to retrieve.
        current_user: Currently authenticated user (any role can read demographics).

    Returns:
        dict: Patient demographics response with keys:
            - patient_id: The requested patient ID
            - data: Complete FHIR Patient resource

    Raises:
        HTTPException: 404 if patient not found in FHIR server.
        HTTPException: 500 if FHIR read operation fails.
    """
    try:
        patient = read_fhir_patient(patient_id)
        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        return DemographicsOut(
            patient_id=patient_id,
            data=FhirPatientResource.model_validate(patient),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to read demographics")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Could not load the demographics",
                "error_code": "demographics_fetch_failed",
            },
        ) from e


@router.post(
    "/patients/{patient_id}/letters",
    dependencies=[
        DEP_REQUIRE_CLINICAL,
        DEP_REQUIRE_ROLES_CLINICIAN,
        DEP_REQUIRE_CSRF,
    ],
    response_model=LetterCreateOut,
)
def write_letter(patient_id: str, letter: LetterIn) -> LetterCreateOut:
    """Create Clinical Letter in OpenEHR.

    Creates a new clinical letter composition in EHRbase for the specified patient.
    Automatically ensures the patient has an EHR in EHRbase (creates if missing).
    Stores the letter title, markdown body, and author information. Requires
    Clinician role and CSRF token validation.

    Letter Storage:
        - Letters stored as OpenEHR Compositions in EHRbase
        - Each patient has corresponding EHR linked by FHIR patient ID
        - Markdown body preserved for future rendering
        - Author metadata includes name and email

    Args:
        patient_id: FHIR Patient ID to associate letter with.
        letter: Letter content (title, body, author metadata).

    Returns:
        dict: Created letter response with keys:
            - patient_id: The patient ID
            - composition_uid: OpenEHR composition UID for retrieval
            - title: Letter title

    Raises:
        HTTPException: 500 if EHR creation or composition write fails.
    """
    try:
        result = create_letter_composition(
            patient_id=patient_id,
            title=letter.title,
            body=letter.body,
            author_name=letter.author_name,
        )
        return LetterCreateOut(
            patient_id=patient_id,
            composition_uid=result.get("uid", {}).get("value"),
            title=letter.title,
        )
    except Exception as e:
        logger.exception("Failed to write letter")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Could not save the letter",
                "error_code": "letter_write_failed",
            },
        ) from e


@router.get(
    "/patients/{patient_id}/letters/{composition_uid}",
    dependencies=[DEP_REQUIRE_CLINICAL],
    response_model=LetterOut,
)
def read_letter(
    patient_id: str,
    composition_uid: str,
    current_user: User = DEP_CURRENT_USER,
) -> LetterOut:
    """Read Specific Clinical Letter from OpenEHR.

    Retrieves a specific clinical letter composition from EHRbase by its
    composition UID. Returns the complete composition including title, body,
    author information, and OpenEHR metadata.

    Args:
        patient_id: FHIR Patient ID the letter belongs to.
        composition_uid: OpenEHR composition UID from letter creation.
        current_user: Currently authenticated user (any role can read letters).

    Returns:
        dict: Letter retrieval response with keys:
            - patient_id: The patient ID
            - composition_uid: The composition UID
            - data: Complete OpenEHR Composition structure

    Raises:
        HTTPException: 404 if letter not found in EHRbase.
        HTTPException: 500 if EHRbase read operation fails.
    """
    try:
        composition = get_letter_composition(patient_id, composition_uid)
        if composition is None:
            raise HTTPException(status_code=404, detail="Letter not found")
        return LetterOut(
            patient_id=patient_id,
            composition_uid=composition_uid,
            data=composition,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to read letter")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Could not load the letter",
                "error_code": "letter_read_failed",
            },
        ) from e


@router.get(
    "/patients/{patient_id}/letters",
    dependencies=[DEP_REQUIRE_CLINICAL],
    response_model=LettersListOut,
)
def list_letters(
    patient_id: str, current_user: User = DEP_CURRENT_USER
) -> LettersListOut:
    """List All Clinical Letters for Patient.

    Retrieves all clinical letter compositions for a specific patient from
    EHRbase. Returns a list of letter metadata (UID, title, creation date)
    without fetching the full content of each letter. Use the individual
    letter endpoint to retrieve complete letter content.

    Args:
        patient_id: FHIR Patient ID to retrieve letters for.
        current_user: Currently authenticated user (any role can list letters).

    Returns:
        dict: Letter list response with keys:
            - patient_id: The patient ID
            - letters: Array of letter metadata (UID, title, created date)

    Raises:
        HTTPException: 500 if EHRbase query fails.
    """
    try:
        letters = list_letters_for_patient(patient_id)
        return LettersListOut(patient_id=patient_id, letters=letters)
    except Exception as e:
        logger.exception("Failed to list letters")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Could not load the letters",
                "error_code": "letter_list_failed",
            },
        ) from e


class FHIRPatientCreateIn(BaseModel):
    """FHIR Patient Creation Request.

    Request model for creating a new FHIR Patient resource with demographics.
    Optional patient_id allows specifying a custom FHIR resource ID instead
    of auto-generated ID.

    Attributes:
        given_name: Patient's first/given name.
        family_name: Patient's surname/family name.
        birth_date: Patient's date of birth (YYYY-MM-DD format).
        gender: Patient's gender (male, female, other, unknown).
        nhs_number: NHS number (10 digits, UK national identifier).
        mrn: Medical Record Number (local hospital identifier).
        patient_id: Optional custom FHIR resource ID.
    """

    model_config = {"extra": "forbid"}

    given_name: str
    family_name: str
    birth_date: str | None = None
    gender: str | None = None
    nhs_number: str | None = None
    mrn: str | None = None
    patient_id: str | None = None


@router.post(
    "/patients",
    dependencies=[DEP_REQUIRE_CLINICAL, DEP_REQUIRE_CSRF],
    response_model=FhirPatientResource,
)
def create_patient_in_fhir(
    data: FHIRPatientCreateIn, current_user: User = DEP_CURRENT_USER
) -> FhirPatientResource:
    """Create New Patient in FHIR Server.

    Creates a new FHIR R4 Patient resource with the provided name information.
    The patient will be assigned a FHIR resource ID (either auto-generated or
    custom if patient_id provided).

    Args:
        data: Patient name and optional ID.
        current_user: Currently authenticated user (any role can create patients).

    Returns:
        dict: Complete FHIR Patient resource with assigned ID.

    Raises:
        HTTPException: 500 if FHIR patient creation fails.
    """
    try:
        patient = create_fhir_patient(
            given_name=data.given_name,
            family_name=data.family_name,
            birth_date=data.birth_date,
            gender=data.gender,
            nhs_number=data.nhs_number,
            mrn=data.mrn,
            patient_id=data.patient_id,
        )
        return FhirPatientResource.model_validate(patient)
    except Exception as e:
        logger.exception("Failed to create FHIR patient")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Could not create the patient",
                "error_code": "patient_create_failed",
            },
        ) from e


@router.get(
    "/patients/{patient_id}",
    dependencies=[DEP_REQUIRE_CLINICAL],
    response_model=FhirPatientResource,
)
def get_patient(
    patient_id: str, current_user: User = DEP_CURRENT_USER
) -> FhirPatientResource:
    """Get Single Patient from FHIR.

    Retrieves a specific patient's demographics from the FHIR server by ID.
    Returns the complete FHIR R4 Patient resource including name, birth date,
    gender, and identifiers. Used by the admin interface when editing patient
    records.

    Args:
        patient_id: FHIR Patient resource ID to retrieve.
        current_user: Currently authenticated user (any role can view patients).

    Returns:
        dict: Complete FHIR Patient resource.

    Raises:
        HTTPException: 404 if patient not found in FHIR server.
        HTTPException: 500 if FHIR server communication fails.
    """
    try:
        patient = read_fhir_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        return FhirPatientResource.model_validate(patient)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to retrieve patient")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Could not load the patient",
                "error_code": "patient_fetch_failed",
            },
        ) from e


@router.patch(
    "/patients/{patient_id}",
    dependencies=[DEP_REQUIRE_CLINICAL, DEP_REQUIRE_CSRF],
    response_model=FhirPatientResource,
)
def update_patient(
    patient_id: str,
    data: FHIRPatientCreateIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> FhirPatientResource:
    """Update Patient in FHIR.

    Updates an existing patient's demographics in the FHIR server. Accepts
    the same fields as patient creation (name, birth_date, gender, identifiers).
    Used by the admin interface when editing patient records.

    Args:
        patient_id: FHIR Patient resource ID to update.
        data: Updated patient demographics.
        current_user: Currently authenticated user, who must share an
            organisation with the patient, or be an operator.
        db: Database session.

    Returns:
        dict: Complete updated FHIR Patient resource.

    Raises:
        HTTPException: 404 if the caller shares no organisation with the
            patient, in the words a missing patient is answered with.
        HTTPException: 404 if patient not found in FHIR server.
        HTTPException: 500 if FHIR update operation fails.
    """
    # Asked before FHIR is, so somebody who may not reach the patient
    # learns nothing from it, not even whether the patient exists.
    _require_shared_org_with_patient(db, current_user, patient_id)

    try:
        # Read existing patient to verify it exists
        existing = read_fhir_patient(patient_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Patient not found")

        updates = changes_to_send(
            given_name=data.given_name,
            family_name=data.family_name,
            birth_date=data.birth_date,
            gender=data.gender,
        )

        # Perform update
        updated_patient = update_fhir_patient(patient_id, updates)
        if not updated_patient:
            raise HTTPException(
                status_code=500, detail="Failed to update patient"
            )
        return FhirPatientResource.model_validate(updated_patient)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update patient")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Could not update the patient",
                "error_code": "patient_update_failed",
            },
        ) from e


@router.get(
    "/patients/{patient_id}/metadata",
    dependencies=[DEP_REQUIRE_CLINICAL],
    response_model=PatientMetadataOut,
)
def get_patient_metadata(
    patient_id: str,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> PatientMetadataOut:
    """Get Patient Metadata.

    Returns application-specific metadata for a patient, including activation
    status. If no metadata record exists, returns default values (is_active=True).

    Args:
        patient_id: FHIR Patient resource ID.
        current_user: Currently authenticated user.
        db: Database session.

    Returns:
        dict: Patient metadata with keys:
            - patient_id: FHIR Patient resource ID
            - is_active: Whether patient is active in the system
    """
    stmt = select(PatientMetadata).where(
        PatientMetadata.patient_id == patient_id
    )
    metadata = db.execute(stmt).scalar_one_or_none()

    if metadata:
        return PatientMetadataOut(
            patient_id=metadata.patient_id,
            is_active=metadata.is_active,
        )
    else:
        # No metadata record means patient is active by default
        return PatientMetadataOut(patient_id=patient_id, is_active=True)


@router.post(
    "/patients/{patient_id}/deactivate",
    dependencies=[
        DEP_REQUIRE_CLINICAL,
        DEP_REQUIRE_CSRF,
        DEP_REQUIRE_MANAGE_USERS,
    ],
    response_model=PatientActivationOut,
)
def deactivate_patient(
    patient_id: str,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> PatientActivationOut:
    """Deactivate Patient Record.

    Marks a patient as inactive in the system. Deactivated patients are hidden
    from clinical views but remain visible in admin pages with a deactivated flag.
    Requires the ``manage_users`` competency and a shared organisation
    with the patient.

    Args:
        patient_id: FHIR Patient resource ID to deactivate.
        current_user: Currently authenticated user.
        db: Database session.

    Returns:
        dict: Confirmation with keys:
            - patient_id: The deactivated patient ID
            - is_active: False
            - message: Success message

    Raises:
        HTTPException: 403 if the user lacks ``manage_users``.
        HTTPException: 404 if patient not found in FHIR.
    """
    # Check permissions

    # Verify patient exists in FHIR
    patient = read_fhir_patient(patient_id)

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    _require_shared_org_with_patient(db, current_user, patient_id)

    # Get or create metadata record
    stmt = select(PatientMetadata).where(
        PatientMetadata.patient_id == patient_id
    )
    metadata = db.execute(stmt).scalar_one_or_none()

    if metadata:
        # Update existing record
        metadata.is_active = False
    else:
        # Create new metadata record
        metadata = PatientMetadata(
            patient_id=patient_id,
            is_active=False,
        )
        db.add(metadata)

    return PatientActivationOut(
        patient_id=patient_id,
        is_active=False,
        message="Patient deactivated successfully",
    )


@router.post(
    "/patients/{patient_id}/activate",
    dependencies=[
        DEP_REQUIRE_CLINICAL,
        DEP_REQUIRE_CSRF,
        DEP_REQUIRE_MANAGE_USERS,
    ],
    response_model=PatientActivationOut,
)
def activate_patient(
    patient_id: str,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> PatientActivationOut:
    """Activate Patient Record.

    Reactivates a previously deactivated patient, making them visible in all
    views again. Requires the ``manage_users`` competency and a shared
    organisation with the patient.

    Args:
        patient_id: FHIR Patient resource ID to activate.
        current_user: Currently authenticated user.
        db: Database session.

    Returns:
        dict: Confirmation with keys:
            - patient_id: The activated patient ID
            - is_active: True
            - message: Success message

    Raises:
        HTTPException: 403 if the user lacks ``manage_users``.
        HTTPException: 404 if patient not found in FHIR.
    """
    # Check permissions

    # Verify patient exists in FHIR
    patient = read_fhir_patient(patient_id)

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    _require_shared_org_with_patient(db, current_user, patient_id)

    # Get or create metadata record
    stmt = select(PatientMetadata).where(
        PatientMetadata.patient_id == patient_id
    )
    metadata = db.execute(stmt).scalar_one_or_none()

    if metadata:
        # Update existing record
        metadata.is_active = True
    else:
        # Create new metadata record (already active by default)
        metadata = PatientMetadata(
            patient_id=patient_id,
            is_active=True,
        )
        db.add(metadata)

    return PatientActivationOut(
        patient_id=patient_id,
        is_active=True,
        message="Patient activated successfully",
    )


@router.get(
    "/patients/{patient_id}/shared-organisations",
    dependencies=[DEP_REQUIRE_CLINICAL],
    response_model=SharedOrganisationsOut,
)
def shared_organisations_endpoint(
    patient_id: str,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> SharedOrganisationsOut:
    """Return organisations shared between the current user and a patient.

    For external users this returns an empty list (they use
    per-patient access grants, not org membership).

    Args:
        patient_id: FHIR Patient resource ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        dict: ``organisations`` list with id/name/type for each shared org.
    """
    shared_org_units = get_shared_org_unit_ids(db, current_user.id, patient_id)

    if not shared_org_units:
        return SharedOrganisationsOut(organisations=[])

    orgs = (
        db.execute(select(OrgUnit).where(OrgUnit.id.in_(shared_org_units)))
        .scalars()
        .all()
    )

    return SharedOrganisationsOut(
        organisations=[
            SharedOrganisationSummary(
                org_unit_id=place.id, name=place.name, type=place.type
            )
            for place in orgs
        ]
    )


def _require_shared_org_with_patient(
    db: Session, current_user: User, patient_id: str
) -> None:
    """Refuse a patient the admin shares no organisation with.

    The org_unit check for the admin routes that act on one patient by id.
    Deliberately *not* ``check_user_patient_access``, which also requires
    a patient-record competency: an admin acting on a patient's account
    holds ``manage_users``, not necessarily one of those, so it would
    refuse the people these routes are for.

    404 rather than 403, matching the other org_unit checks, so the response
    does not confirm that a patient exists to an admin who may not see
    them. Patient existence is worth more care than most: the id is a
    clinical identifier.

    Args:
        db: Core database session.
        current_user: The admin making the request.
        patient_id: FHIR Patient resource ID being acted on.

    Raises:
        HTTPException: 404 if they share no organisation.
    """
    if current_user.platform_role == "superadmin":
        return
    if not get_shared_org_unit_ids(db, current_user.id, patient_id):
        raise HTTPException(status_code=404, detail="Patient not found")


@router.patch(
    "/users/{user_id}/link-patient",
    response_model=LinkPatientOut,
    dependencies=[
        DEP_REQUIRE_CSRF,
        DEP_REQUIRE_MANAGE_USERS,
    ],
)
def link_patient_to_user(
    user_id: int,
    body: LinkPatientIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> LinkPatientOut:
    """Link a user account to a FHIR patient record.

    Requires ``manage_users``. Sets ``fhir_patient_id`` on the user.

    Args:
        user_id: User ID.
        body: Must contain ``fhir_patient_id``.
        current_user: Authenticated user holding ``manage_users``.
        db: Database session.

    Returns:
        dict: Confirmation with user and patient IDs.
    """
    fhir_patient_id = body.fhir_patient_id

    if not fhir_patient_id:
        raise HTTPException(
            status_code=422, detail="fhir_patient_id is required"
        )

    target = db.get(User, user_id)

    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    check_account_within_reach(db, current_user, target)

    # Check not already linked to another user
    clash = db.scalar(
        select(User).where(
            User.fhir_patient_id == fhir_patient_id,
            User.id != user_id,
        )
    )

    if clash is not None:
        raise HTTPException(
            status_code=409,
            detail="FHIR patient already linked to another user",
        )

    target.fhir_patient_id = fhir_patient_id

    return LinkPatientOut(
        user_id=user_id,
        fhir_patient_id=fhir_patient_id,
    )


@router.post(
    "/patients/{patient_id}/invite-external",
    dependencies=[DEP_REQUIRE_CLINICAL, DEP_REQUIRE_CSRF],
    response_model=InviteExternalOut,
)
def invite_external_user(
    patient_id: str,
    body: InviteExternalIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> InviteExternalOut:
    """Generate an invite link for an external user.

    Only the patient themselves (via ``fhir_patient_id``) or an
    admin/superadmin may issue invites.

    Args:
        patient_id: FHIR Patient resource ID.
        body: Email and user type.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        dict: ``invite_url`` containing the signed JWT.
    """
    # The patient themselves, or someone who administers patients here.
    # `manage_patient_membership` rather than `manage_users`: inviting
    # someone to a patient's record is patient centric, and a patient is
    # not a user.
    is_own = (
        current_user.fhir_patient_id is not None
        and current_user.fhir_patient_id == patient_id
    )
    manages_patients = (
        "manage_patient_membership" in current_user.get_final_competencies()
    )

    if not (is_own or manages_patients):
        raise HTTPException(
            status_code=403,
            detail=(
                "Only the patient or someone who manages patients can "
                "invite external users"
            ),
        )

    token = create_invite_token(
        patient_id=patient_id,
        email=body.email,
        user_type=body.user_type,
    )

    # In production the base URL would come from settings
    invite_url = f"/app/accept-invite?token={token}"

    return InviteExternalOut(invite_url=invite_url, token=token)


@router.delete(
    "/patients/{patient_id}/external-access/{user_id}",
    dependencies=[
        DEP_REQUIRE_CLINICAL,
        DEP_REQUIRE_CSRF,
        DEP_REQUIRE_MANAGE_USERS,
    ],
    response_model=RevokeAccessOut,
)
def revoke_external_access(
    patient_id: str,
    user_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> RevokeAccessOut:
    """Revoke an external user's access to a patient.

    Requires ``manage_users`` and a shared organisation with the
    patient. Soft-deletes by setting ``revoked_at``.

    Args:
        patient_id: FHIR Patient resource ID.
        user_id: ID of the external user.
        current_user: Authenticated user holding ``manage_users``.
        db: Database session.

    Returns:
        dict: Confirmation message.
    """
    _require_shared_org_with_patient(db, current_user, patient_id)

    grant = db.scalar(
        select(ExternalPatientAccess).where(
            ExternalPatientAccess.user_id == user_id,
            ExternalPatientAccess.patient_id == patient_id,
            ExternalPatientAccess.revoked_at.is_(None),
        )
    )

    if grant is None:
        raise HTTPException(
            status_code=404, detail="Active access grant not found"
        )

    grant.revoked_at = datetime.now(UTC)

    return RevokeAccessOut(status="revoked")


@router.get(
    "/patients/{patient_id}/external-access",
    dependencies=[DEP_REQUIRE_CLINICAL],
    response_model=ExternalAccessListOut,
)
def list_external_access(
    patient_id: str,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ExternalAccessListOut:
    """List external users with access to a patient.

    Returns active (non-revoked) external access grants.

    Args:
        patient_id: FHIR Patient resource ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        dict: ``grants`` list with user info and access details.
    """
    # The patient themselves, or someone who administers patients here -
    # the same pair as the invite route above.
    is_own = (
        current_user.fhir_patient_id is not None
        and current_user.fhir_patient_id == patient_id
    )
    manages_patients = (
        "manage_patient_membership" in current_user.get_final_competencies()
    )

    if not (is_own or manages_patients):
        raise HTTPException(status_code=403, detail="Access denied")

    grants = (
        db.execute(
            select(ExternalPatientAccess).where(
                ExternalPatientAccess.patient_id == patient_id,
                ExternalPatientAccess.revoked_at.is_(None),
            )
        )
        .scalars()
        .all()
    )

    return ExternalAccessListOut(
        grants=[
            ExternalAccessGrant(
                user_id=g.user_id,
                username=g.user.username,
                email=g.user.email,
                granted_at=g.granted_at.isoformat(),
                access_level=g.access_level,
            )
            for g in grants
        ]
    )
