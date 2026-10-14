"""The user administration routes: make, change, list and switch off accounts.

Moved out of ``main.py`` on 12 October 2026, as they were: the same
addresses, guards and response models. The rules are in ``app/users/``;
a route here reads the request, calls them, and shapes the answer. The
request bodies are in ``app/schemas/users_admin.py``.

``main.py`` includes this router under the API prefix.
"""

import logging
from datetime import datetime

from fastapi import (
    APIRouter,
    BackgroundTasks,
    HTTPException,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.practising import competencies_at
from app.config import settings
from app.deps import (
    DEP_CURRENT_USER,
    DEP_GET_SESSION,
    DEP_REQUIRE_CSRF,
    DEP_REQUIRE_MANAGE_PEOPLE,
)
from app.email.account import account_email_values
from app.email.render import render_email, send_args
from app.email_send import (
    send_email,
)
from app.features.teaching.enrolment import current_enrolments
from app.models import (
    User,
    org_unit_member,
)
from app.organisations import (
    org_units_whose_people_reached_by,
    organisation_org_units_of,
)
from app.schemas.auth import (
    DetailResponse,
    PractisingAtOut,
    TeachingEnrolmentsAtOut,
    TeachingModuleOut,
    UserActionOut,
    UserIdActionOut,
    UserOut,
    UsersListOut,
)
from app.schemas.users_admin import (
    AdminUserCreateIn,
    AdminUserUpdateIn,
    PractisingAtIn,
    TeachingEnrolmentsAtIn,
)
from app.users.activation import deactivate_account, reactivate_account
from app.users.closure_notice import closure_notice_for, send_closure_notice
from app.users.create import NewAccount, create_account
from app.users.listing import (
    admin_rows,
    people_around_a_patient,
    people_to_list,
    people_within_reach,
    picker_rows,
)
from app.users.reach import check_account_within_reach
from app.users.reopening_notice import (
    reopening_notice_for,
    send_reopening_notice,
)
from app.users.scope import check_may_act_on_operator
from app.users.setup_invite import setup_invite_for
from app.users.update import AccountChanges, update_account

logger = logging.getLogger(__name__)

router = APIRouter()


def _enrolments_wanted(
    enrolments: list[TeachingEnrolmentsAtIn],
) -> dict[int, dict[str, datetime | None]]:
    """Turn the form's enrolments into the plain values the rules take.

    For each organisation, in the order sent, each module and when its
    enrolment ends. Nothing is lost in a mapping: the models above
    refuse an organisation named twice and a module named twice.
    """
    return {
        entry.org_unit_id: {
            module.module_id: module.ends_on for module in entry.modules
        }
        for entry in enrolments
    }


def _practice_wanted(
    practising: list[PractisingAtIn],
) -> dict[int, list[str]]:
    """Turn the form's practice list into the plain values the rules take.

    For each org_unit, in the order sent, what they may practise there.
    Nothing is lost in a mapping: the models refuse an org_unit named
    twice.
    """
    return {entry.org_unit_id: entry.competencies for entry in practising}


@router.post(
    "/users",
    response_model=UserActionOut,
    dependencies=[DEP_REQUIRE_MANAGE_PEOPLE],
)
def create_user_with_cbac(
    payload: AdminUserCreateIn,
    current_user: User = DEP_REQUIRE_CSRF,
    db: Session = DEP_GET_SESSION,
) -> UserActionOut:
    """Admin User Creation with CBAC.

    Creates a new user account with full CBAC (Competency-Based Access Control)
    settings including base profession, competencies, and system permissions.
    Requires the ``manage_users`` competency.

    Validation Rules:
    - Email and password must not be empty
    - Password must be at least 8 characters long
    - Username must be unique across all users
    - Email must be unique across all users
    - Requesting user must hold ``manage_users``

    Args:
        payload: User creation data with CBAC settings.
        current_user: Currently authenticated user (must be admin/superadmin).
        db: Database session for user creation.

    Returns:
        dict: Success response with new user ID and username.

    Raises:
        HTTPException: 403 if the requesting user lacks ``manage_users``.
        HTTPException: 400 if validation fails or constraints violated.
    """
    # The form's values as the rules take them. An entry for nowhere, in
    # either list, is the same as no entry.
    new = NewAccount(
        name=payload.name,
        username=payload.username,
        email=payload.email,
        password=payload.password,
        base_profession=payload.base_profession,
        additional_competencies=payload.additional_competencies,
        removed_competencies=payload.removed_competencies,
        platform_role=payload.platform_role,
        org_unit_ids=payload.org_unit_ids or [],
        practising=_practice_wanted(payload.practising or []),
        teaching_enrolments=_enrolments_wanted(
            payload.teaching_enrolments or []
        ),
    )

    user = create_account(db, current_user, new)

    return UserActionOut(
        detail="created",
        id=user.id,
        username=user.username,
        email=user.email,
    )


@router.patch(
    "/users/{user_id}",
    response_model=UserActionOut,
    dependencies=[DEP_REQUIRE_MANAGE_PEOPLE],
)
def update_user(
    user_id: int,
    payload: AdminUserUpdateIn,
    current_user: User = DEP_REQUIRE_CSRF,
    db: Session = DEP_GET_SESSION,
) -> UserActionOut:
    """Update User Account.

    Updates an existing user account with new CBAC settings and/or credentials.
    Only provided fields will be updated - omitted fields remain unchanged.
    Password is only updated if provided (optional for security).

    Requires the ``manage_users`` competency and a shared organisation
    with the patient.

    Validation Rules:
    - Only updates fields that are provided (not None)
    - Email must be unique if being changed
    - Username must be unique if being changed
    - Password must be at least 8 characters if being changed
    - Requesting user must hold ``manage_users``

    Args:
        user_id: ID of the user to update.
        payload: User update data (all fields optional).
        current_user: Authenticated user holding ``manage_users``.
        db: Database session.

    Returns:
        dict: Success response with updated user details.

    Raises:
        HTTPException: 403 if the requesting user lacks ``manage_users``.
        HTTPException: 404 if user not found.
        HTTPException: 400 if validation fails or constraints violated.
    """
    # Check authorization
    # Fetch user
    user = db.scalar(select(User).where(User.id == user_id))

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Only an operator may modify another operator
    check_may_act_on_operator(current_user, user)
    check_account_within_reach(db, current_user, user)

    # The form's values as the rules take them. A field that was not
    # sent stays None, so it is not touched.
    changes = AccountChanges(
        username=payload.username,
        name=payload.name,
        email=payload.email,
        password=payload.password,
        base_profession=payload.base_profession,
        additional_competencies=payload.additional_competencies,
        removed_competencies=payload.removed_competencies,
        platform_role=payload.platform_role,
        org_unit_ids=payload.org_unit_ids,
        practising=(
            _practice_wanted(payload.practising)
            if payload.practising is not None
            else None
        ),
        teaching_enrolments=(
            _enrolments_wanted(payload.teaching_enrolments)
            if payload.teaching_enrolments is not None
            else None
        ),
    )

    update_account(db, current_user, user, changes)

    return UserActionOut(
        detail="updated",
        id=user.id,
        username=user.username,
        email=user.email,
    )


@router.post(
    "/users/{user_id}/deactivate",
    response_model=UserIdActionOut,
    dependencies=[DEP_REQUIRE_MANAGE_PEOPLE],
)
def deactivate_user(
    user_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = DEP_REQUIRE_CSRF,
    db: Session = DEP_GET_SESSION,
) -> UserIdActionOut:
    """Deactivate User Account.

    Marks a user account as inactive. Deactivated users cannot log in
    but their data is preserved for audit purposes. Their answer about
    news and updates moves to the newsletter list, and they are emailed
    to say the account is closed, with their newsletter in the same
    email.
    Requires the ``manage_users`` competency and a shared organisation
    with the patient.

    Args:
        user_id: ID of the user to deactivate.
        current_user: Authenticated user holding ``manage_users``.
        db: Database session.

    Returns:
        dict: Confirmation with deactivated user details.

    Raises:
        HTTPException: 403 if the requesting user lacks ``manage_users``.
        UserAdminError: 404, 403 or 400 for whatever
            ``deactivate_account`` refuses.
    """
    user = deactivate_account(db, current_user, user_id)

    # Their owner is told, once, with their newsletter in the same
    # email. Worked out here and sent after the answer, so that a mail
    # provider that is down neither holds up the closure nor undoes it.
    notice = closure_notice_for(db, user)

    if notice is not None:
        background_tasks.add_task(send_closure_notice, notice)

    return UserIdActionOut(
        detail="deactivated",
        id=user.id,
        username=user.username,
    )


@router.post(
    "/users/{user_id}/reactivate",
    response_model=UserIdActionOut,
    dependencies=[DEP_REQUIRE_MANAGE_PEOPLE],
)
def reactivate_user(
    user_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = DEP_REQUIRE_CSRF,
    db: Session = DEP_GET_SESSION,
) -> UserIdActionOut:
    """Reactivate User Account.

    Marks a previously deactivated user account as active again, and
    emails its owner to say so.
    Requires the ``manage_users`` competency and a shared organisation
    with the patient.

    Args:
        user_id: ID of the user to reactivate.
        current_user: Authenticated user holding ``manage_users``.
        db: Database session.

    Returns:
        dict: Confirmation with reactivated user details.

    Raises:
        HTTPException: 403 if the requesting user lacks ``manage_users``.
        UserAdminError: 404, 403 or 400 for whatever
            ``reactivate_account`` refuses.
    """
    user = reactivate_account(db, current_user, user_id)

    # Told once, after the answer, as the closure is: a mail provider
    # that is down neither holds up the reopening nor undoes it.
    notice = reopening_notice_for(user)

    if notice is not None:
        background_tasks.add_task(send_reopening_notice, notice)

    return UserIdActionOut(
        detail="reactivated",
        id=user.id,
        username=user.username,
    )


@router.post(
    "/users/{user_id}/send-invite",
    response_model=DetailResponse,
    dependencies=[DEP_REQUIRE_MANAGE_PEOPLE],
)
def send_invite_email(
    user_id: int,
    current_user: User = DEP_REQUIRE_CSRF,
    db: Session = DEP_GET_SESSION,
) -> DetailResponse:
    """Send Invite Email.

    Sends an email to the user inviting them to set up or update their
    credentials via a password reset link.
    Requires the ``manage_users`` competency and a shared organisation
    with the patient.

    Args:
        user_id: ID of the user to invite.
        current_user: Authenticated user holding ``manage_users``.
        db: Database session.

    Returns:
        dict: Confirmation that the invite was sent.

    Raises:
        HTTPException: 403 if the requesting user lacks ``manage_users``.
        UserAdminError: 404 or 403 for whatever ``setup_invite_for``
            refuses.
    """
    invite = setup_invite_for(db, current_user, user_id)
    user = invite.user

    # `invite=1` is what makes the page ask the marketing question: the
    # same page serves a forgotten password, where it is not asked.
    reset_url = (
        f"{settings.FRONTEND_URL}/reset-password"
        f"?token={invite.token}&invite=1"
    )
    send_email(
        to=user.email,
        **send_args(
            render_email(
                "account_invite.html.j2",
                "quill",
                {
                    **account_email_values(user),
                    "setup_url": reset_url,
                    "ttl_minutes": settings.PASSWORD_RESET_TTL_MIN,
                },
            )
        ),
    )

    return DetailResponse(detail="Invite email sent")


@router.get(
    "/users",
    response_model=UsersListOut,
    dependencies=[DEP_REQUIRE_MANAGE_PEOPLE],
)
def list_users(
    patient_id: str | None = None,
    exclude_org_unit: int | None = None,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> UsersListOut:
    """List users, optionally filtered by shared org with a patient.

    When ``patient_id`` is provided, returns staff who share an org with
    that patient plus external users with active access grants. This is
    used by the message participant picker.

    Without ``patient_id``, returns all users the caller may administer.
    Use ``exclude_org_unit`` to exclude people who are already members
    of the org_unit being added to.

    ``exclude_place`` was the older spelling and has now gone, a release
    after ``exclude_org_unit`` arrived beside it. ``exclude_org`` went
    before that and counted in organisation ids. A caller still sending
    either now excludes nobody rather than being quietly misread, which
    is the safer of the two failures: the list is longer than it should
    be, not shorter.

    Args:
        patient_id: Optional FHIR patient ID to filter by shared org.
        exclude_org_unit: Optional org_unit id to exclude members of.
        current_user: Currently authenticated user.
        db: Database session.

    Returns:
        dict: Response with users array.

    Raises:
        HTTPException: 403 if user lacks permissions.
        UserAdminError: 403 if ``patient_id`` is sent by somebody whose
            scope has a limit. See :mod:`app.users.listing`.
        HTTPException: 500 if the list could not be read.
    """
    if patient_id:
        return UsersListOut(
            users=picker_rows(
                people_around_a_patient(db, current_user, patient_id)
            )
        )

    within = people_within_reach(db, current_user)

    try:
        people = people_to_list(db, within, exclude_org_unit=exclude_org_unit)

        return UsersListOut(users=admin_rows(db, people))
    except Exception as e:
        logger.exception("Failed to list users")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Could not load the user list",
                "error_code": "user_list_failed",
            },
        ) from e


@router.get(
    "/users/{user_id}",
    response_model=UserOut,
    dependencies=[DEP_REQUIRE_MANAGE_PEOPLE],
)
def get_user(
    user_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> UserOut:
    """Get User Details.

    Retrieves detailed information about a specific user including their
    CBAC settings (base profession, competencies) and system permissions.
    Used by the admin interface when editing user accounts.

    Requires the ``manage_users`` competency and a shared organisation
    with the patient.

    Args:
        user_id: ID of the user to retrieve.
        current_user: Authenticated user holding ``manage_users``.
        db: Database session.

    Returns:
        dict: User details with keys:
            - id: User ID
            - username: Username
            - email: Email address
            - name: Full name (currently same as username)
            - base_profession: Base profession ID
            - additional_competencies: Array of additional competency IDs
            - removed_competencies: Array of removed competency IDs

    Raises:
        HTTPException: 403 if the user lacks ``manage_users``.
        HTTPException: 404 if user not found.
    """
    # Check permissions
    # Fetch user
    user = db.scalar(select(User).where(User.id == user_id))

    # An emptied account answers as one that was never there: see
    # ``account_the_caller_may_act_on``, which the writing routes use.
    if not user or user.emptied_at is not None:
        raise HTTPException(status_code=404, detail="User not found")

    # An operator may be viewed by an admin who reaches an org_unit
    # they belong to, as anybody else there may: the list names them,
    # so the row has to open. Changing them stays an operator's alone,
    # refused on each route that writes.
    check_account_within_reach(db, current_user, user)
    reached = org_units_whose_people_reached_by(db, current_user)

    user_org_unit_ids = [
        row[0]
        for row in db.execute(
            select(org_unit_member.c.org_unit_id).where(
                org_unit_member.c.user_id == user_id
            )
        ).all()
    ]

    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        name=user.full_name or user.username,
        # Only an emptied account has none, and this route answers 404
        # for one before it gets here.
        base_profession=user.base_profession or "",
        additional_competencies=user.additional_competency_ids,
        removed_competencies=user.removed_competency_ids,
        platform_role=user.platform_role,
        is_active=user.is_active,
        # Every org_unit they belong to, organisations included, in
        # the ids the org_units themselves answer in.
        org_unit_ids=user_org_unit_ids,
        practising=[
            PractisingAtOut(
                org_unit_id=unit_id,
                competencies=sorted(
                    competencies_at(db, user, org_unit_id=unit_id)
                ),
            )
            for unit_id in sorted(user_org_unit_ids)
            # Only where the caller reaches, so the answer never names
            # practice at an org_unit they could not open.
            if reached is None or unit_id in reached
        ],
        # For the form's Enrolment step, and only for somebody who runs
        # teaching: what they are enrolled on at each organisation they
        # belong to that the caller reaches.
        teaching_enrolments=(
            [
                TeachingEnrolmentsAtOut(
                    org_unit_id=organisation_id,
                    modules=[
                        TeachingModuleOut(
                            module_id=row.question_bank_id,
                            ends_on=row.ends_on,
                        )
                        for row in current_enrolments(
                            db, user.id, org_unit_id=organisation_id
                        )
                    ],
                )
                for organisation_id in sorted(
                    organisation_org_units_of(db, user_org_unit_ids)
                )
                if reached is None or organisation_id in reached
            ]
            if current_user.platform_role == "superadmin"
            or "manage_teaching" in current_user.get_final_competencies()
            else []
        ),
    )
