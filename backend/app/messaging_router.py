"""The conversation routes: threads, messages, participants and read marks.

Moved out of ``main.py`` on 12 October 2026, as they were: the same
addresses, guards and response models. The rules are in
``app/messaging.py``; a route here reads the request, calls them, and
shapes the answer.

``main.py`` includes this router under the API prefix.
"""

from fastapi import (
    APIRouter,
    HTTPException,
)
from sqlalchemy.orm import Session

from app.deps import (
    DEP_CURRENT_USER,
    DEP_GET_SESSION,
    DEP_REQUIRE_CLINICAL,
    DEP_REQUIRE_CSRF,
)
from app.fhir_client import (
    FhirCommunicationError,
)
from app.messaging import (
    MessagingError,
    add_participant,
    create_conversation,
    get_conversation_detail,
    join_conversation,
    list_conversations,
    list_patient_conversations,
    mark_conversation_read,
    participant_name,
    send_message,
    set_conversation_status,
)
from app.models import (
    Conversation,
    User,
)
from app.schemas.messaging import (
    AddParticipantIn,
    ConversationCreateIn,
    ConversationDetailOut,
    ConversationListOut,
    ConversationOut,
    ConversationStatusUpdateIn,
    MarkReadOut,
    MessageCreateIn,
    MessageOut,
    ParticipantOut,
)

router = APIRouter()

# ---------------------------------------------------------------------------
# Messaging
#
# These routes carry no ``has_competency`` dependency, and that is
# deliberate rather than missed. Which competency applies depends on
# how the caller reaches the conversation - as a participant, through
# a shared org_unit, or through an external grant - so the check is
# made per conversation in ``app.messaging``, in
# ``_reads_without_taking_part`` and ``check_user_patient_access``.
# ---------------------------------------------------------------------------


@router.post(
    "/conversations",
    response_model=ConversationDetailOut,
    dependencies=[DEP_REQUIRE_CLINICAL, DEP_REQUIRE_CSRF],
)
def create_conversation_endpoint(
    body: ConversationCreateIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ConversationDetailOut:
    """Create a new messaging conversation.

    Creates a FHIR Communication resource as the source of truth,
    then projects the data into SQL for fast reads.

    Args:
        body: Conversation details including first message.
        current_user: Authenticated user (conversation creator).
        db: Database session.

    Returns:
        ConversationDetailOut: The newly created conversation.
    """
    try:
        return create_conversation(
            db=db,
            creator=current_user,
            patient_id=body.patient_id,
            initial_message=body.initial_message,
            subject=body.subject,
            participant_ids=body.participant_ids,
            include_patient_as_participant=(
                body.include_patient_as_participant
            ),
        )
    except MessagingError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"message": exc.message, "error_code": exc.error_code},
        ) from exc
    except FhirCommunicationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Failed to create message in clinical store",
        ) from exc


@router.get(
    "/conversations",
    response_model=ConversationListOut,
    dependencies=[DEP_REQUIRE_CLINICAL],
)
def list_conversations_endpoint(
    status: str | None = None,
    patient_id: str | None = None,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ConversationListOut:
    """List conversations for the current user.

    Returns conversations the user participates in, optionally
    filtered by status or patient.

    Args:
        status: Optional filter by conversation status.
        patient_id: Optional filter by FHIR patient ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        ConversationListOut: List of conversations with metadata.
    """
    items = list_conversations(
        db=db,
        user=current_user,
        status=status,
        patient_id=patient_id,
    )

    return ConversationListOut(conversations=items)


@router.get(
    "/patients/{patient_id}/conversations",
    response_model=ConversationListOut,
    dependencies=[DEP_REQUIRE_CLINICAL],
)
def list_patient_conversations_endpoint(
    patient_id: str,
    status: str | None = None,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ConversationListOut:
    """List all conversations about a patient.

    Returns all conversations for the patient regardless of
    whether the current user is a participant.

    Args:
        patient_id: FHIR patient ID.
        status: Optional filter by conversation status.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        ConversationListOut: All conversations for this patient.
    """
    items = list_patient_conversations(
        db=db,
        patient_id=patient_id,
        user=current_user,
        status=status,
    )

    return ConversationListOut(conversations=items)


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationDetailOut,
    dependencies=[DEP_REQUIRE_CLINICAL],
)
def get_conversation_endpoint(
    conversation_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ConversationDetailOut:
    """Get a single conversation with all messages.

    Also marks the conversation as read for the current user.

    Args:
        conversation_id: ID of the conversation.
        current_user: Authenticated user (must be a participant).
        db: Database session.

    Returns:
        ConversationDetailOut: Full conversation with messages.

    Raises:
        HTTPException: 404 if not found or user is not a participant.
    """
    result = get_conversation_detail(
        db=db, conversation_id=conversation_id, user=current_user
    )

    if result is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return result


@router.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationOut,
    dependencies=[DEP_REQUIRE_CLINICAL, DEP_REQUIRE_CSRF],
)
def update_conversation_status_endpoint(
    conversation_id: int,
    body: ConversationStatusUpdateIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ConversationOut:
    """Update conversation status (e.g. close, archive).

    Only participants can update a conversation's status.

    Args:
        conversation_id: ID of the conversation.
        body: New status value.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        ConversationOut: Updated conversation.

    Raises:
        HTTPException: 404 if not found or user is not a participant.
    """
    # A refusal here goes out as a plain sentence, as it always has
    # from this route. The other conversation routes send a message and
    # an error code together, and changing this one to match would
    # change what a caller is sent.
    try:
        conv, unread = set_conversation_status(
            db=db,
            conversation_id=conversation_id,
            user=current_user,
            status=body.status,
        )
    except MessagingError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    last_msg = (
        max(conv.messages, key=lambda m: m.created_at)
        if conv.messages
        else None
    )

    return ConversationOut(
        id=conv.id,
        fhir_conversation_id=conv.fhir_conversation_id,
        patient_id=conv.patient_id,
        subject=conv.subject,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        participants=[
            ParticipantOut(
                user_id=p.user_id,
                username=p.user.username,
                display_name=participant_name(p.user),
                role=p.role,
                joined_at=p.joined_at,
            )
            for p in conv.participants
        ],
        last_message_preview=last_msg.body[:200] if last_msg else None,
        last_message_time=last_msg.created_at if last_msg else None,
        unread_count=unread,
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageOut,
    dependencies=[DEP_REQUIRE_CLINICAL, DEP_REQUIRE_CSRF],
)
def send_message_endpoint(
    conversation_id: int,
    body: MessageCreateIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> MessageOut:
    """Send a message in a conversation.

    Writes to FHIR first, then projects to SQL.

    Args:
        conversation_id: ID of the conversation.
        body: Message body (and optional amendment reference).
        current_user: Authenticated user (must be a participant).
        db: Database session.

    Returns:
        MessageOut: The newly created message.

    Raises:
        HTTPException: 404 if conversation not found.
        HTTPException: 403 if user is not a participant.
        HTTPException: 502 if FHIR write fails.
    """
    try:
        return send_message(
            db=db,
            conversation_id=conversation_id,
            sender=current_user,
            body=body.body,
            amends_id=body.amends_id,
        )
    except MessagingError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"message": exc.message, "error_code": exc.error_code},
        ) from exc
    except FhirCommunicationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Failed to create message in clinical store",
        ) from exc


@router.post(
    "/conversations/{conversation_id}/participants",
    response_model=ParticipantOut,
    dependencies=[DEP_REQUIRE_CLINICAL, DEP_REQUIRE_CSRF],
)
def add_participant_endpoint(
    conversation_id: int,
    body: AddParticipantIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ParticipantOut:
    """Add a participant to a conversation.

    Only existing participants can add others.

    Args:
        conversation_id: ID of the conversation.
        body: User to add and their role.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        ParticipantOut: The added participant.

    Raises:
        HTTPException: 404 if conversation not found.
        HTTPException: 403 if requesting user is not a participant.
    """
    conv = db.get(Conversation, conversation_id)

    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    cp = next(
        (p for p in conv.participants if p.user_id == current_user.id), None
    )

    if cp is None:
        raise HTTPException(
            status_code=403,
            detail="Only participants can add others",
        )
    try:
        return add_participant(
            db=db,
            conversation_id=conversation_id,
            user_id=body.user_id,
            role=body.role,
        )
    except MessagingError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"message": exc.message, "error_code": exc.error_code},
        ) from exc


@router.get(
    "/conversations/{conversation_id}/participants",
    response_model=list[ParticipantOut],
    dependencies=[DEP_REQUIRE_CLINICAL],
)
def list_participants_endpoint(
    conversation_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> list[ParticipantOut]:
    """List participants in a conversation.

    Args:
        conversation_id: ID of the conversation.
        current_user: Authenticated user (must be a participant).
        db: Database session.

    Returns:
        list[ParticipantOut]: Participants in the conversation.

    Raises:
        HTTPException: 404 if not found or user is not a participant.
    """
    conv = db.get(Conversation, conversation_id)

    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    cp = next(
        (p for p in conv.participants if p.user_id == current_user.id), None
    )

    if cp is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return [
        ParticipantOut(
            user_id=p.user_id,
            username=p.user.username,
            display_name=participant_name(p.user),
            role=p.role,
            joined_at=p.joined_at,
        )
        for p in conv.participants
    ]


@router.post(
    "/conversations/{conversation_id}/join",
    response_model=ParticipantOut,
    dependencies=[DEP_REQUIRE_CLINICAL, DEP_REQUIRE_CSRF],
)
def join_conversation_endpoint(
    conversation_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ParticipantOut:
    """Join a conversation as staff of one of its organisations.

    Staff can self-join any conversation at an organisation they are
    staff of. Everyone else - patients, and trainees who reach the
    organisation through a site - must be added by a participant.

    Args:
        conversation_id: ID of the conversation.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        ParticipantOut: The new or existing participant record.

    Raises:
        HTTPException: 404 if conversation not found.
        HTTPException: 403 if the user is not staff of one of its
            organisations, or lacks ``access_patient_records``.
    """
    try:
        return join_conversation(
            db=db,
            conversation_id=conversation_id,
            user=current_user,
        )
    except MessagingError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"message": exc.message, "error_code": exc.error_code},
        ) from exc


@router.post(
    "/conversations/{conversation_id}/read",
    response_model=MarkReadOut,
    dependencies=[DEP_REQUIRE_CLINICAL, DEP_REQUIRE_CSRF],
)
def mark_read_endpoint(
    conversation_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> MarkReadOut:
    """Mark a conversation as read for the current user.

    Args:
        conversation_id: ID of the conversation.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        MarkReadOut: Success status.

    Raises:
        HTTPException: 404 if not found or user is not a participant.
    """
    ok = mark_conversation_read(
        db=db, conversation_id=conversation_id, user_id=current_user.id
    )

    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return MarkReadOut(ok=True)
