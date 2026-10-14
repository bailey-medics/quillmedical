"""Routes for a caller's own competencies, and the one example route
that a competency guards.

Moved out of ``main.py`` on 12 October 2026, as they were: the same
addresses, guards and response models. ``main.py`` includes this router
under the API prefix.
"""

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from sqlalchemy.orm import Session

from app.cbac.grants import sync_competency_rows
from app.deps import (
    DEP_CURRENT_USER,
    DEP_GET_SESSION,
    DEP_REQUIRE_CSRF,
    has_competency,
)
from app.models import (
    User,
)
from app.schemas.cbac import (
    PrescriptionRequest,
    PrescriptionResponse,
    UpdateCompetenciesRequest,
    UserCompetenciesResponse,
)

router = APIRouter()


@router.get(
    "/cbac/my-competencies",
    response_model=UserCompetenciesResponse,
    tags=["cbac"],
)
async def get_my_competencies(
    user: User = DEP_CURRENT_USER,
) -> UserCompetenciesResponse:
    """Get current user's resolved competencies.

    Returns the authenticated user's base profession and final competencies
    after resolving base profession + additional - removed competencies.

    Returns:
        UserCompetenciesResponse: User's competency information
    """
    return UserCompetenciesResponse(
        user_id=user.id,
        username=user.username,
        # Only an emptied account has none, and it cannot sign in.
        base_profession=user.base_profession or "",
        additional_competencies=user.additional_competency_ids,
        removed_competencies=user.removed_competency_ids,
        final_competencies=user.get_final_competencies(),
    )


@router.post(
    "/prescriptions/controlled",
    response_model=PrescriptionResponse,
    tags=["cbac", "prescriptions"],
    status_code=201,
)
async def prescribe_controlled(
    prescription: PrescriptionRequest,
    user: User = Depends(has_competency("prescribe_controlled_schedule_2")),
    _csrf: User = DEP_REQUIRE_CSRF,
    db: Session = DEP_GET_SESSION,
) -> PrescriptionResponse:
    """Prescribe controlled substance (Schedule 2).

    Example endpoint demonstrating CBAC protection. Only users with
    'prescribe_controlled_schedule_2' competency can access this endpoint.

    Requires:
        - Competency: prescribe_controlled_schedule_2
        - Authentication: JWT cookie

    Args:
        prescription: Prescription details
        user: Authenticated user (injected by dependency)
        db: Database session

    Returns:
        PrescriptionResponse: Prescription confirmation

    Raises:
        HTTPException: 403 if user lacks competency
    """
    # In real implementation, this would create prescription in database
    return PrescriptionResponse(
        status="success",
        prescription_id="RX001",
        prescriber=user.username,
        patient_id=prescription.patient_id,
        medication=prescription.medication,
        dose=prescription.dose,
        duration_days=prescription.duration_days,
    )


@router.patch(
    "/cbac/my-competencies",
    response_model=UserCompetenciesResponse,
    tags=["cbac"],
    dependencies=[DEP_REQUIRE_CSRF],
)
async def update_my_competencies(
    data: UpdateCompetenciesRequest,
    user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> UserCompetenciesResponse:
    """Update the **caller's own** additional/removed competencies.

    Self-scoped by construction: ``UpdateCompetenciesRequest`` carries no
    target user, so this edits ``current_user`` and can edit nobody else.
    To change someone else's competencies use ``PATCH /users/{user_id}``,
    which takes the same three CBAC fields, refuses an admin editing a
    superadmin, and is scoped to the admin's own organisations.

    An earlier docstring described this as the route by which administrators
    edit "a user's" competencies. It never was, and reading it that way
    hides what the admin gate below actually permits: an admin granting
    themselves any competency, clinical ones included. That is deliberate
    for now and is to be revisited with end-to-end tests - see
    ``docs/docs/plans/2026-09-09-platform-role-plan.md``.

    Args:
        data: Additional and removed competencies to write to the caller.
        user: Authenticated user, who is also the subject of the edit.
        db: Database session

    Returns:
        UserCompetenciesResponse: The caller's updated competency information

    Raises:
        HTTPException: 403 unless the caller's ``platform_role`` is
            ``superadmin``.
    """
    # Self-granting, so only an operator may use it. Everyone else asks
    # another holder of `manage_users`, through `PATCH /users/{id}`,
    # which does the same job with an org_unit check and a second person.
    #
    # Gating this on `manage_users` was considered and rejected: holding
    # the competency would then be what lets a holder keep granting it to
    # themselves, and the competency becomes the key to its own lock.
    if user.platform_role != "superadmin":
        raise HTTPException(
            status_code=403,
            detail=(
                "Competencies must be changed by another user who holds "
                "manage_users"
            ),
        )

        # Update user's competencies
    # A list left out of the request keeps what the rows hold now.
    additional = (
        list(data.additional_competencies)
        if data.additional_competencies is not None
        else user.additional_competency_ids
    )
    removed = (
        list(data.removed_competencies)
        if data.removed_competencies is not None
        else user.removed_competency_ids
    )
    sync_competency_rows(
        user,
        additional=additional,
        removed=removed,
        source="operator",
        granted_by=user.id,
    )

    db.flush()
    db.refresh(user)

    return UserCompetenciesResponse(
        user_id=user.id,
        username=user.username,
        # Only an emptied account has none, and it cannot sign in.
        base_profession=user.base_profession or "",
        additional_competencies=user.additional_competency_ids,
        removed_competencies=user.removed_competency_ids,
        final_competencies=user.get_final_competencies(),
    )
