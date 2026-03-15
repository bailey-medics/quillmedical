/**
 * Patient Message Thread Page Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import PatientMessageThread from "./PatientMessageThread";
import {
  fetchConversation,
  sendMessage,
  type ConversationDetailResponse,
} from "@lib/messaging";

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

vi.mock("@lib/messaging", () => ({
  fetchConversation: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { id: 1, name: "Mark Bailey" },
    },
  }),
}));

vi.mock("@/components/profile-pic/ProfilePic", () => ({
  default: ({ givenName }: { givenName?: string }) => (
    <div data-testid="profile-pic">{givenName}</div>
  ),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useOutletContext: () => ({
      patient: {
        id: "test-patient",
        name: "James Green",
        givenName: "James",
        familyName: "Green",
        gradientIndex: 8,
      },
      setPatient: vi.fn(),
      setPatientNav: vi.fn(),
    }),
  };
});

const mockConversation: ConversationDetailResponse = {
  id: 1,
  fhir_conversation_id: "conv-uuid-1",
  patient_id: "test-patient",
  subject: "Gastro clinic",
  status: "active",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  is_participant: true,
  can_write: true,
  include_patient_as_participant: false,
  participants: [
    {
      user_id: 1,
      username: "mark.bailey",
      display_name: "Mark Bailey",
      role: "initiator",
      joined_at: "2025-01-01T00:00:00Z",
    },
  ],
  messages: [
    {
      id: 1,
      fhir_communication_id: "fhir-1",
      sender_id: 1,
      sender_username: "mark.bailey",
      sender_display_name: "Mark Bailey",
      body: "I'd like to book in for Dr Corbett",
      amends_id: null,
      is_amendment: false,
      created_at: "2025-01-01T10:00:00Z",
    },
    {
      id: 2,
      fhir_communication_id: "fhir-2",
      sender_id: 2,
      sender_username: "dr.corbett",
      sender_display_name: "Dr Corbett",
      body: "Here is your personalised dietary guide",
      amends_id: null,
      is_amendment: false,
      created_at: "2025-01-01T11:00:00Z",
    },
  ],
};

describe("PatientMessageThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchConversation).mockResolvedValue(mockConversation);
    vi.mocked(sendMessage).mockResolvedValue({
      id: 99,
      fhir_communication_id: "fhir-99",
      sender_id: 1,
      sender_username: "mark.bailey",
      sender_display_name: "Mark Bailey",
      body: "Test message",
      amends_id: null,
      is_amendment: false,
      created_at: "2025-01-02T10:00:00Z",
    });
  });

  it("renders messages from conversation", async () => {
    renderWithRouter(<PatientMessageThread />, {
      routePath: "/patients/:id/messages/:conversationId",
      initialRoute: "/patients/test-patient/messages/1",
    });

    await waitFor(() => {
      expect(
        screen.getByText(/I'd like to book in for Dr Corbett/),
      ).toBeInTheDocument();
    });
  });

  it("renders Dr Corbett messages", async () => {
    renderWithRouter(<PatientMessageThread />, {
      routePath: "/patients/:id/messages/:conversationId",
      initialRoute: "/patients/test-patient/messages/1",
    });

    await waitFor(() => {
      expect(
        screen.getByText(/personalised dietary guide/),
      ).toBeInTheDocument();
    });
  });

  it("allows sending a new message", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PatientMessageThread />, {
      routePath: "/patients/:id/messages/:conversationId",
      initialRoute: "/patients/test-patient/messages/1",
    });

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Type a message..."),
      ).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "Test message");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Test message")).toBeInTheDocument();
  });
});
