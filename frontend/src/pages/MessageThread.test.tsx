/**
 * MessageThread Page Tests
 *
 * Tests for the conversation thread detail page including:
 * - Rendering messages from API
 * - Not-found state for failed fetches
 * - Back navigation
 * - Sending new messages
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

import { renderWithRouter } from "@/test/test-utils";
import MessageThread from "./MessageThread";
import {
  fetchConversation,
  sendMessage,
  type ConversationDetailResponse,
} from "@lib/messaging";

vi.mock("@lib/messaging", () => ({
  fetchConversation: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn().mockResolvedValue({ patients: [], users: [] }) },
}));

// Mock ProfilePic component
vi.mock("@/components/profile-pic/ProfilePic", () => ({
  default: ({
    givenName,
    familyName,
    isLoading,
  }: {
    givenName?: string;
    familyName?: string;
    size: string;
    isLoading?: boolean;
  }) =>
    isLoading ? (
      <div data-testid="profile-pic-loading" />
    ) : (
      <div
        data-testid="profile-pic"
        data-given={givenName}
        data-family={familyName}
      />
    ),
}));

// Mock useAuth
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { id: 1, name: "Mark Bailey" },
    },
  }),
}));

const mockNavigate = vi.fn();
const mockSetPatient = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useOutletContext: () => ({ setPatient: mockSetPatient }),
  };
});

const mockConversation: ConversationDetailResponse = {
  id: 1,
  fhir_conversation_id: "conv-uuid-1",
  patient_id: "patient-1",
  subject: "Prescription renewal",
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
      body: "Amlodipine 5mg prescription renewal needed",
      amends_id: null,
      is_amendment: false,
      created_at: "2025-01-01T10:00:00Z",
    },
    {
      id: 2,
      fhir_communication_id: "fhir-2",
      sender_id: 2,
      sender_username: "sarah.johnson",
      sender_display_name: "Sarah Johnson",
      body: "Your repeat prescription has been processed",
      amends_id: null,
      is_amendment: false,
      created_at: "2025-01-01T11:00:00Z",
    },
  ],
};

describe("MessageThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchConversation).mockResolvedValue(mockConversation);
    vi.mocked(sendMessage).mockResolvedValue({
      id: 99,
      fhir_communication_id: "fhir-99",
      sender_id: 1,
      sender_username: "mark.bailey",
      sender_display_name: "Mark Bailey",
      body: "Test reply message",
      amends_id: null,
      is_amendment: false,
      created_at: "2025-01-02T10:00:00Z",
    });
  });

  describe("Known conversation", () => {
    it("renders messages from the thread", async () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/1",
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Amlodipine 5mg prescription renewal/),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText(/repeat prescription has been processed/),
      ).toBeInTheDocument();
    });

    it("renders back button", async () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /back to messages/i }),
        ).toBeInTheDocument();
      });
    });

    it("navigates back when back button is clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /back to messages/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /back to messages/i }),
      );

      expect(mockNavigate).toHaveBeenCalledWith("/messages");
    });

    it("allows sending a new message", async () => {
      const user = userEvent.setup();
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/1",
      });

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Type a message..."),
        ).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText("Type a message...");
      await user.type(input, "Test reply message");
      await user.click(screen.getByRole("button", { name: /send/i }));

      expect(screen.getByText("Test reply message")).toBeInTheDocument();
    });
  });

  describe("Unknown conversation", () => {
    beforeEach(() => {
      vi.mocked(fetchConversation).mockRejectedValue(new Error("Not found"));
    });

    it("shows not-found message for unknown ID", async () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/999",
      });

      await waitFor(() => {
        expect(screen.getByText("Conversation not found")).toBeInTheDocument();
      });
    });

    it("renders back button on not-found page", async () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/999",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /back to messages/i }),
        ).toBeInTheDocument();
      });
    });
  });
});
