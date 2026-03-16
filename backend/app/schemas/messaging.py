"""Pydantic schemas for messaging API endpoints.

Request and response models for conversations, messages, and participants.
"""

from datetime import datetime

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------


class ConversationCreateIn(BaseModel):
    """Create a new conversation about a patient.

    Attributes:
        patient_id: FHIR Patient UUID the conversation is about.
        subject: Optional thread topic / subject line.
        participant_ids: Other user IDs to add as participants.
        initial_message: Body text of the first message.
        include_patient_as_participant: Whether the patient should be
            able to reply to this conversation.
    """

    patient_id: str
    subject: str | None = None
    participant_ids: list[int] = Field(default_factory=list)
    initial_message: str
    include_patient_as_participant: bool = False

    model_config = {"extra": "forbid"}


class MessageCreateIn(BaseModel):
    """Send a message in an existing conversation.

    Attributes:
        body: Message text (supports markdown).
        amends_id: Optional ID of a message this one amends.
    """

    body: str
    amends_id: int | None = None

    model_config = {"extra": "forbid"}


class ConversationStatusUpdateIn(BaseModel):
    """Update a conversation's status.

    Attributes:
        status: New status value.
    """

    status: str = Field(pattern=r"^(new|active|resolved|closed)$")

    model_config = {"extra": "forbid"}


class AddParticipantIn(BaseModel):
    """Tag / add a user to a conversation.

    Attributes:
        user_id: ID of the user to add.
        role: How they are being added.
    """

    user_id: int
    role: str = Field(default="participant", pattern=r"^(participant|tagged)$")

    model_config = {"extra": "forbid"}


class InviteExternalIn(BaseModel):
    """Invite an external user to access a patient's records.

    Attributes:
        email: Recipient email address.
        user_type: ``external_hcp`` or ``patient_advocate``.
    """

    email: str = Field(max_length=255)
    user_type: str = Field(pattern=r"^(external_hcp|patient_advocate)$")

    model_config = {"extra": "forbid"}


class AcceptInviteIn(BaseModel):
    """Accept an invite token (new user registration or existing user grant).

    Attributes:
        token: JWT invite token from the URL.
        username: Username for new user registration (optional if existing).
        password: Password for new user registration (optional if existing).
    """

    token: str
    username: str | None = None
    password: str | None = None

    model_config = {"extra": "forbid"}


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------


class ParticipantOut(BaseModel):
    """A conversation participant."""

    user_id: int
    username: str
    display_name: str
    role: str
    joined_at: datetime


class MessageOut(BaseModel):
    """A single message in a conversation."""

    id: int
    fhir_communication_id: str
    sender_id: int
    sender_username: str
    sender_display_name: str
    body: str
    amends_id: int | None = None
    is_amendment: bool = False
    created_at: datetime


class ConversationOut(BaseModel):
    """Summary of a conversation (for list views)."""

    id: int
    fhir_conversation_id: str
    patient_id: str
    subject: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    participants: list[ParticipantOut]
    last_message_preview: str | None = None
    last_message_time: datetime | None = None
    unread_count: int = 0
    is_participant: bool = False
    can_write: bool = False
    include_patient_as_participant: bool = False


class ConversationListOut(BaseModel):
    """Paginated list of conversations."""

    conversations: list[ConversationOut]


class ConversationDetailOut(BaseModel):
    """Full conversation with all messages."""

    id: int
    fhir_conversation_id: str
    patient_id: str
    subject: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    participants: list[ParticipantOut]
    messages: list[MessageOut]
    is_participant: bool = False
    can_write: bool = False
    include_patient_as_participant: bool = False
