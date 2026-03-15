"""Messaging service — CQRS coordination layer.

Writes message content to FHIR (source of truth) then projects
metadata into SQL tables for fast reads. All reads come from SQL.
"""

import logging
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.fhir_client import create_fhir_communication
from app.models import Conversation, ConversationParticipant, Message, User
from app.schemas.messaging import (
    ConversationDetailOut,
    ConversationOut,
    MessageOut,
    ParticipantOut,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _user_display_name(user: User) -> str:
    return user.username


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

    Writes the first message to FHIR, then creates all SQL records.
    """
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

    # Add the creator as initiator
    creator_participant = ConversationParticipant(
        conversation_id=conv.id,
        user_id=creator.id,
        role="initiator",
    )
    db.add(creator_participant)

    # Add other participants
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
    user_id: int,
    status: str | None = None,
    patient_id: str | None = None,
) -> list[ConversationOut]:
    """List conversations the user participates in."""
    query = (
        db.query(Conversation)
        .join(ConversationParticipant)
        .filter(ConversationParticipant.user_id == user_id)
    )
    if status:
        query = query.filter(Conversation.status == status)
    if patient_id:
        query = query.filter(Conversation.patient_id == patient_id)

    query = query.order_by(Conversation.updated_at.desc())
    conversations = query.all()

    results: list[ConversationOut] = []
    for conv in conversations:
        # Calculate unread count for this user
        cp = next((p for p in conv.participants if p.user_id == user_id), None)
        if cp and cp.last_read_at:
            unread = sum(
                1
                for m in conv.messages
                if m.created_at > cp.last_read_at and m.sender_id != user_id
            )
        else:
            # Never read — all messages from others are unread
            unread = sum(1 for m in conv.messages if m.sender_id != user_id)

        results.append(
            _build_conversation_out(
                conv,
                unread,
                is_participant=True,
                can_write=True,
            )
        )

    return results


def get_conversation_detail(
    *,
    db: Session,
    conversation_id: int,
    user_id: int,
) -> ConversationDetailOut | None:
    """Get a single conversation with all messages.

    Any authenticated user with access to the patient record can read.
    Updates last_read_at only if the user is a participant.
    """
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        return None

    cp = next((p for p in conv.participants if p.user_id == user_id), None)
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
    """Add a user to a conversation."""
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
    user_id: int,
    status: str | None = None,
) -> list[ConversationOut]:
    """List all conversations about a patient.

    Returns all conversations regardless of participation, with
    is_participant and can_write flags per conversation.
    """
    query = db.query(Conversation).filter(
        Conversation.patient_id == patient_id
    )
    if status:
        query = query.filter(Conversation.status == status)

    query = query.order_by(Conversation.updated_at.desc())
    conversations = query.all()

    results: list[ConversationOut] = []
    for conv in conversations:
        cp = next((p for p in conv.participants if p.user_id == user_id), None)
        is_participant = cp is not None

        if cp is not None and cp.last_read_at:
            unread = sum(
                1
                for m in conv.messages
                if m.created_at > cp.last_read_at and m.sender_id != user_id
            )
        elif cp is not None:
            unread = sum(1 for m in conv.messages if m.sender_id != user_id)
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
    Patients must be added by an existing participant.
    """
    if user.system_permissions == "patient":
        raise PermissionError("Patients cannot self-join conversations")

    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise ValueError("Conversation not found")

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
    db.commit()
    db.refresh(cp)
    return _participant_out(cp)
