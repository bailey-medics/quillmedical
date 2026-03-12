/**
 * MessageThread Page Tests
 *
 * Tests for the conversation thread detail page including:
 * - Rendering messages for known conversations
 * - Not-found state for unknown conversation IDs
 * - Back navigation
 * - Sending new messages
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

import { renderWithRouter } from "@/test/test-utils";
import MessageThread from "./MessageThread";

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
      user: { id: "mark-bailey", name: "Mark Bailey" },
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

describe("MessageThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Known conversation", () => {
    it("renders messages from the thread", () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/conv-1",
      });

      expect(screen.getByText(/prescription renewal/)).toBeInTheDocument();
      expect(screen.getByText(/Amlodipine 5mg/)).toBeInTheDocument();
    });

    it("renders back button", () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/conv-1",
      });

      expect(
        screen.getByRole("button", { name: /back to messages/i }),
      ).toBeInTheDocument();
    });

    it("navigates back when back button is clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/conv-1",
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
        initialRoute: "/messages/conv-1",
      });

      const input = screen.getByPlaceholderText("Type a message...");
      await user.type(input, "Test reply message");
      await user.click(screen.getByRole("button", { name: /send/i }));

      expect(screen.getByText("Test reply message")).toBeInTheDocument();
    });

    it("sets patient in ribbon via setPatient", () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/conv-1",
      });

      expect(mockSetPatient).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "patient-1",
          name: "John Smith",
        }),
      );
    });
  });

  describe("Active conversation (conv-2)", () => {
    it("renders conversation messages", () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/conv-2",
      });

      expect(screen.getByText(/book in for Dr Corbett/)).toBeInTheDocument();
    });

    it("renders appointment reminder with action buttons", () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/conv-2",
      });

      expect(
        screen.getByText(/Reminder.*gastro clinic appointment/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "I'll attend" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "I can't make it" }),
      ).toBeInTheDocument();
    });

    it("removes action buttons after clicking one", async () => {
      const user = userEvent.setup();
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/conv-2",
      });

      await user.click(screen.getByRole("button", { name: "I'll attend" }));

      expect(
        screen.queryByRole("button", { name: "I'll attend" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "I can't make it" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Resolved conversation (conv-4)", () => {
    it("renders conversation messages", () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/conv-4",
      });

      expect(
        screen.getByText(/headaches for the past week/),
      ).toBeInTheDocument();
    });
  });

  describe("Unknown conversation", () => {
    it("shows not-found message for unknown ID", () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/unknown-id",
      });

      expect(screen.getByText("Conversation not found")).toBeInTheDocument();
    });

    it("renders back button on not-found page", () => {
      renderWithRouter(<MessageThread />, {
        routePath: "/messages/:conversationId",
        initialRoute: "/messages/unknown-id",
      });

      expect(
        screen.getByRole("button", { name: /back to messages/i }),
      ).toBeInTheDocument();
    });
  });
});
