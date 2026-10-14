/**
 * Messaging API types and helpers.
 *
 * Mirrors the backend Pydantic schemas so frontend and backend
 * stay in sync.
 */

import { api } from "@lib/api";

// ---------------------------------------------------------------------------
// Response types (from backend schemas)
// ---------------------------------------------------------------------------

export interface ParticipantResponse {
  user_id: number;
  username: string;
  display_name: string;
  role: string;
  joined_at: string;
}

export interface MessageResponse {
  id: number;
  fhir_communication_id: string;
  sender_id: number;
  sender_username: string;
  sender_display_name: string;
  /** True when the sender's account has been emptied */
  sender_deleted?: boolean;
  body: string;
  amends_id: number | null;
  is_amendment: boolean;
  created_at: string;
}

export interface ConversationResponse {
  id: number;
  fhir_conversation_id: string;
  patient_id: string;
  subject: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  participants: ParticipantResponse[];
  last_message_preview: string | null;
  last_message_time: string | null;
  unread_count: number;
  is_participant: boolean;
  can_write: boolean;
  include_patient_as_participant: boolean;
}

export interface ConversationListResponse {
  conversations: ConversationResponse[];
}

export interface ConversationDetailResponse {
  id: number;
  fhir_conversation_id: string;
  patient_id: string;
  subject: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  participants: ParticipantResponse[];
  messages: MessageResponse[];
  is_participant: boolean;
  can_write: boolean;
  include_patient_as_participant: boolean;
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export interface CreateConversationRequest {
  patient_id: string;
  subject?: string;
  participant_ids?: number[];
  initial_message: string;
  include_patient_as_participant?: boolean;
}

export interface SendMessageRequest {
  body: string;
  amends_id?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export function fetchConversations(params?: {
  status?: string;
  patient_id?: string;
}): Promise<ConversationListResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.patient_id) qs.set("patient_id", params.patient_id);
  const query = qs.toString();
  return api.get<ConversationListResponse>(
    `/conversations${query ? `?${query}` : ""}`,
  );
}

export function fetchConversation(
  conversationId: number,
): Promise<ConversationDetailResponse> {
  return api.get<ConversationDetailResponse>(
    `/conversations/${conversationId}`,
  );
}

export function createConversation(
  data: CreateConversationRequest,
): Promise<ConversationDetailResponse> {
  return api.post<ConversationDetailResponse>("/conversations", data);
}

export function sendMessage(
  conversationId: number,
  data: SendMessageRequest,
): Promise<MessageResponse> {
  return api.post<MessageResponse>(
    `/conversations/${conversationId}/messages`,
    data,
  );
}

export function markConversationRead(
  conversationId: number,
): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`/conversations/${conversationId}/read`);
}

export function fetchPatientConversations(
  patientId: string,
  params?: { status?: string },
): Promise<ConversationListResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();
  return api.get<ConversationListResponse>(
    `/patients/${patientId}/conversations${query ? `?${query}` : ""}`,
  );
}

export function joinConversation(
  conversationId: number,
): Promise<ParticipantResponse> {
  return api.post<ParticipantResponse>(`/conversations/${conversationId}/join`);
}

/** Who a message is shown as from */
export interface SenderNames {
  senderName: string;
  givenName: string;
  familyName: string;
}

/**
 * The name to show beside a message, and the two parts its picture
 * draws initials from.
 *
 * A message stays when its sender's account is emptied. It is then from
 * "Deleted account", and there is nobody to draw initials for, so both
 * parts are empty.
 */
export function senderNames(
  message: Pick<MessageResponse, "sender_display_name" | "sender_deleted">,
): SenderNames {
  if (message.sender_deleted) {
    return {
      senderName: message.sender_display_name,
      givenName: "",
      familyName: "",
    };
  }

  const parts = message.sender_display_name.split(" ");

  return {
    senderName: message.sender_display_name,
    givenName: parts[0] ?? "",
    familyName: parts.slice(1).join(" "),
  };
}
