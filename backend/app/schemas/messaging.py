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
    """

    patient_id: str
    subject: str | None = None
    participant_ids: list[int] = Field(default_factory=list)
    initial_message: str

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
