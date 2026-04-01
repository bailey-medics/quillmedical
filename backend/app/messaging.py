"""Messaging service — CQRS coordination layer.

Writes message content to FHIR (source of truth) then projects
metadata into SQL tables for fast reads. All reads come from SQL.

Organisation-scoped: conversations auto-include all shared orgs
between creator and patient. When a cross-org participant joins,
their orgs snowball onto the conversation.
"""

import logging
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.fhir_client import create_fhir_communication
from app.models import (
    Conversation,
    ConversationParticipant,
    ExternalPatientAccess,
    Message,
    User,
    message_organisation,
)
from app.organisations import (
    check_user_patient_access,
    get_shared_org_ids,
    get_user_org_ids,
)
from app.schemas.messaging import (
    ConversationDetailOut,
    ConversationOut,
    MessageOut,
    ParticipantOut,
)
from app.system_permissions.permissions import is_external_user

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _snowball_orgs(db: Session, conversation_id: int, user_id: int) -> None:
    """Add a user's org(s) to a conversation (org snowball effect)."""
    user_orgs = get_user_org_ids(db, user_id)
    if not user_orgs:
        return
    # Get existing conversation org IDs
    existing = db.execute(
        message_organisation.select().where(
            message_organisation.c.conversation_id == conversation_id
        )
    ).all()
    existing_org_ids = {r.organisation_id for r in existing}
    for org_id in user_orgs:
        if org_id not in existing_org_ids:
            db.execute(
                message_organisation.insert().values(
                    conversation_id=conversation_id,
                    organisation_id=org_id,
                )
            )


def _user_has_conversation_access(
    db: Session, user: User, conv: Conversation
) -> bool:
    """Check if user can access a conversation.

    Access is granted if:
    - user is a participant, OR
    - user's org(s) overlap with the conversation's orgs, OR
    - user is an external type with active access to the patient.
    """
    # Participant check
    cp = next((p for p in conv.participants if p.user_id == user.id), None)
    if cp is not None:
        return True

    # Org overlap check
    user_orgs = set(get_user_org_ids(db, user.id))
    conv_org_ids = {o.id for o in conv.organisations}
    if user_orgs & conv_org_ids:
        return True

    # External access grant (see ALL messages for granted patients)
    if is_external_user(user.system_permissions):
        grant = (
            db.query(ExternalPatientAccess)
            .filter(
                ExternalPatientAccess.user_id == user.id,
                ExternalPatientAccess.patient_id == conv.patient_id,
                ExternalPatientAccess.revoked_at.is_(None),
            )
            .first()
        )
        if grant is not None:
            return True

    return False


def _user_display_name(user: User) -> str:
    return user.full_name or user.username


def _participant_out(cp: ConversationParticipant) -> ParticipantOut:
    return ParticipantOut(
        user_id=cp.user_id,
        username=cp.user.username,
        display_name=_user_display_name(cp.user),
        role=cp.role,
        joined_at=cp.joined_at,
    )


def _message_out(msg: Message) -> MessageOut:
    return MessageOut(
        id=msg.id,
        fhir_communication_id=msg.fhir_communication_id,
        sender_id=msg.sender_id,
        sender_username=msg.sender.username,
        sender_display_name=_user_display_name(msg.sender),
        body=msg.body,
        amends_id=msg.amends_id,
        is_amendment=msg.amends_id is not None,
        created_at=msg.created_at,
    )


def _build_conversation_out(
    conv: Conversation,
    unread_count: int,
    *,
    is_participant: bool,
    can_write: bool,
) -> ConversationOut:
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
        participants=[_participant_out(p) for p in conv.participants],
        last_message_preview=last_msg.body[:200] if last_msg else None,
        last_message_time=last_msg.created_at if last_msg else None,
        unread_count=unread_count,
        is_participant=is_participant,
        can_write=can_write,
        include_patient_as_participant=(conv.include_patient_as_participant),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def create_conversation(
    *,
    db: Session,
    creator: User,
    patient_id: str,
    initial_message: str,
    subject: str | None = None,
    participant_ids: list[int] | None = None,
    include_patient_as_participant: bool = False,
) -> ConversationDetailOut:
    """Create a new conversation and its first message.

    Validates the creator has access to the patient, writes the first
    message to FHIR, then creates all SQL records including org links.
    """
    # Validate creator has access to this patient
    if not check_user_patient_access(db, creator, patient_id):
        raise PermissionError(
            "You do not share an organisation with this patient"
        )

    conv_uuid = str(uuid.uuid4())

    # --- FHIR write (source of truth) ---
    fhir_resource = create_fhir_communication(
        conversation_id=conv_uuid,
        patient_id=patient_id,
        sender_display=_user_display_name(creator),
        sender_user_id=creator.id,
        body=initial_message,
    )
    fhir_comm_id: str = fhir_resource["id"]

    # --- SQL projection ---
    conv = Conversation(
        fhir_conversation_id=conv_uuid,
        patient_id=patient_id,
        subject=subject,
        status="new",
        include_patient_as_participant=include_patient_as_participant,
    )
    db.add(conv)
    db.flush()  # get conv.id

    # Auto-add all shared orgs between creator and patient
    shared_org_ids = get_shared_org_ids(db, creator.id, patient_id)
    for org_id in shared_org_ids:
        db.execute(
            message_organisation.insert().values(
                conversation_id=conv.id,
                organisation_id=org_id,
            )
        )

    # Add the creator as initiator
    creator_participant = ConversationParticipant(
        conversation_id=conv.id,
        user_id=creator.id,
        role="initiator",
    )
    db.add(creator_participant)

    # Add other participants (with org snowball)
    if participant_ids:
        for uid in participant_ids:
            if uid == creator.id:
                continue
            db.add(
                ConversationParticipant(
                    conversation_id=conv.id,
                    user_id=uid,
                    role="participant",
                )
            )
            _snowball_orgs(db, conv.id, uid)

    # Project the first message
    msg = Message(
        fhir_communication_id=fhir_comm_id,
        conversation_id=conv.id,
        sender_id=creator.id,
        body=initial_message,
    )
    db.add(msg)
    db.commit()
    db.refresh(conv)

    return ConversationDetailOut(
        id=conv.id,
        fhir_conversation_id=conv.fhir_conversation_id,
        patient_id=conv.patient_id,
        subject=conv.subject,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        participants=[_participant_out(p) for p in conv.participants],
        messages=[_message_out(msg)],
        is_participant=True,
        can_write=True,
        include_patient_as_participant=(conv.include_patient_as_participant),
    )


def list_conversations(
    *,
    db: Session,
    user: User,
    status: str | None = None,
    patient_id: str | None = None,
) -> list[ConversationOut]:
    """List conversations the user can access.

    Includes conversations where the user is a participant, or where
    the user's org(s) overlap with the conversation's orgs, or where
    the user is an external type with access to the patient.
    """
    query = db.query(Conversation)
    if status:
        query = query.filter(Conversation.status == status)
    if patient_id:
        query = query.filter(Conversation.patient_id == patient_id)

    query = query.order_by(Conversation.updated_at.desc())
    conversations = query.all()

    user_org_ids = set(get_user_org_ids(db, user.id))

    # For external users, get their granted patient IDs
    external_patient_ids: set[str] = set()
    if is_external_user(user.system_permissions):
        rows = db.execute(
            ExternalPatientAccess.__table__.select().where(
                ExternalPatientAccess.user_id == user.id,
                ExternalPatientAccess.revoked_at.is_(None),
            )
        ).all()
        external_patient_ids = {r.patient_id for r in rows}

    results: list[ConversationOut] = []
    for conv in conversations:
        cp = next((p for p in conv.participants if p.user_id == user.id), None)
        is_participant = cp is not None

        # Access check: participant OR org overlap OR external grant
        conv_org_ids = {o.id for o in conv.organisations}
        has_org_access = bool(user_org_ids & conv_org_ids)
        has_external_access = conv.patient_id in external_patient_ids

        if not (is_participant or has_org_access or has_external_access):
            continue

        if cp and cp.last_read_at:
            unread = sum(
                1
                for m in conv.messages
                if m.created_at > cp.last_read_at and m.sender_id != user.id
            )
        elif cp:
            unread = sum(1 for m in conv.messages if m.sender_id != user.id)
        else:
            unread = 0

        results.append(
            _build_conversation_out(
                conv,
                unread,
                is_participant=is_participant,
                can_write=is_participant,
            )
        )

    return results


def get_conversation_detail(
    *,
    db: Session,
    conversation_id: int,
    user: User,
) -> ConversationDetailOut | None:
    """Get a single conversation with all messages.

    Any user with org-based or external access can read.
    Updates last_read_at only if the user is a participant.
    """
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        return None

    # Access check
    if not _user_has_conversation_access(db, user, conv):
        return None

    cp = next((p for p in conv.participants if p.user_id == user.id), None)
    is_participant = cp is not None

    # Mark as read only for participants
    if cp is not None:
        cp.last_read_at = func.now()
        db.commit()
        db.refresh(conv)

    sorted_msgs = sorted(conv.messages, key=lambda m: m.created_at)

    return ConversationDetailOut(
        id=conv.id,
        fhir_conversation_id=conv.fhir_conversation_id,
        patient_id=conv.patient_id,
        subject=conv.subject,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        participants=[_participant_out(p) for p in conv.participants],
        messages=[_message_out(m) for m in sorted_msgs],
        is_participant=is_participant,
        can_write=is_participant,
        include_patient_as_participant=(conv.include_patient_as_participant),
    )


def send_message(
    *,
    db: Session,
    conversation_id: int,
    sender: User,
    body: str,
    amends_id: int | None = None,
) -> MessageOut:
    """Send a message in an existing conversation.

    Writes to FHIR first, then projects to SQL.
    """
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise ValueError("Conversation not found")

    # Validate sender is a participant
    cp = next((p for p in conv.participants if p.user_id == sender.id), None)
    if cp is None:
        raise PermissionError("User is not a participant")

    # Validate amendment
    amends_fhir_id: str | None = None
    if amends_id is not None:
        amended = db.get(Message, amends_id)
        if amended is None:
            raise ValueError("Amended message not found")
        if amended.conversation_id != conversation_id:
            raise ValueError("Amended message is not in this conversation")
        if amended.sender_id != sender.id:
            raise PermissionError("Can only amend your own messages")
        amends_fhir_id = amended.fhir_communication_id

    # Find first message for partOf linking
    first_msg = (
        min(conv.messages, key=lambda m: m.created_at)
        if conv.messages
        else None
    )

    # --- FHIR write ---
    fhir_resource = create_fhir_communication(
        conversation_id=conv.fhir_conversation_id,
        patient_id=conv.patient_id,
        sender_display=_user_display_name(sender),
        sender_user_id=sender.id,
        body=body,
        first_message_fhir_id=(
            first_msg.fhir_communication_id if first_msg else None
        ),
        amends_fhir_id=amends_fhir_id,
    )
    fhir_comm_id: str = fhir_resource["id"]

    # --- SQL projection ---
    msg = Message(
        fhir_communication_id=fhir_comm_id,
        conversation_id=conversation_id,
        sender_id=sender.id,
        body=body,
        amends_id=amends_id,
    )
    db.add(msg)

    # Update conversation status and timestamp
    if conv.status == "new":
        conv.status = "active"

    db.commit()
    db.refresh(msg)

    return _message_out(msg)


def add_participant(
    *,
    db: Session,
    conversation_id: int,
    user_id: int,
    role: str = "participant",
) -> ParticipantOut:
    """Add a user to a conversation. Snowballs their org(s) in."""
    user = db.get(User, user_id)
    if user is None:
        raise ValueError("User not found")

    existing = (
        db.query(ConversationParticipant)
        .filter_by(conversation_id=conversation_id, user_id=user_id)
        .first()
    )
    if existing:
        return _participant_out(existing)

    cp = ConversationParticipant(
        conversation_id=conversation_id,
        user_id=user_id,
        role=role,
    )
    db.add(cp)

    # Snowball: add the new participant's orgs to the conversation
    _snowball_orgs(db, conversation_id, user_id)

    db.commit()
    db.refresh(cp)
    return _participant_out(cp)


def mark_conversation_read(
    *,
    db: Session,
    conversation_id: int,
    user_id: int,
) -> bool:
    """Update last_read_at for a participant. Returns True if successful."""
    cp = (
        db.query(ConversationParticipant)
        .filter_by(conversation_id=conversation_id, user_id=user_id)
        .first()
    )
    if cp is None:
        return False
    cp.last_read_at = func.now()
    db.commit()
    return True


def list_patient_conversations(
    *,
    db: Session,
    patient_id: str,
    user: User,
    status: str | None = None,
) -> list[ConversationOut]:
    """List all conversations about a patient.

    Only returns conversations the user can access via org membership,
    participation, or external access grant.
    """
    # First verify user has access to this patient
    if not check_user_patient_access(db, user, patient_id):
        return []

    query = db.query(Conversation).filter(
        Conversation.patient_id == patient_id
    )
    if status:
        query = query.filter(Conversation.status == status)

    query = query.order_by(Conversation.updated_at.desc())
    conversations = query.all()

    user_org_ids = set(get_user_org_ids(db, user.id))
    is_ext = is_external_user(user.system_permissions)

    results: list[ConversationOut] = []
    for conv in conversations:
        cp = next((p for p in conv.participants if p.user_id == user.id), None)
        is_participant = cp is not None

        # For non-external users, check org overlap
        if not is_participant and not is_ext:
            conv_org_ids = {o.id for o in conv.organisations}
            if not (user_org_ids & conv_org_ids):
                continue

        # External users see ALL conversations for granted patients

        if cp is not None and cp.last_read_at:
            unread = sum(
                1
                for m in conv.messages
                if m.created_at > cp.last_read_at and m.sender_id != user.id
            )
        elif cp is not None:
            unread = sum(1 for m in conv.messages if m.sender_id != user.id)
        else:
            unread = 0

        results.append(
            _build_conversation_out(
                conv,
                unread,
                is_participant=is_participant,
                can_write=is_participant,
            )
        )

    return results


def join_conversation(
    *,
    db: Session,
    conversation_id: int,
    user: User,
) -> ParticipantOut:
    """Allow a staff member to join a conversation.

    Only users with staff-level permissions or above can self-join.
    The user must be in one of the conversation's orgs.
    External users cannot self-join.
    """
    if user.system_permissions == "patient":
        raise PermissionError("Patients cannot self-join conversations")
    if is_external_user(user.system_permissions):
        raise PermissionError("External users cannot self-join conversations")

    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise ValueError("Conversation not found")

    # Verify org membership
    user_org_ids = set(get_user_org_ids(db, user.id))
    conv_org_ids = {o.id for o in conv.organisations}
    if not (user_org_ids & conv_org_ids):
        raise PermissionError(
            "You must be in one of the message's organisations to join"
        )

    existing = (
        db.query(ConversationParticipant)
        .filter_by(conversation_id=conversation_id, user_id=user.id)
        .first()
    )
    if existing:
        return _participant_out(existing)

    cp = ConversationParticipant(
        conversation_id=conversation_id,
        user_id=user.id,
        role="participant",
    )
    db.add(cp)

    # Snowball the joining user's orgs
    _snowball_orgs(db, conversation_id, user.id)

    db.commit()
    db.refresh(cp)
    return _participant_out(cp)
