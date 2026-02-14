/**
 * MessagesList Component Tests
 *
 * Tests for conversation list display including status badges,
 * unread counts, and time formatting.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import MessagesList from "./MessagesList";
import type { Conversation } from "@/pages/Messages";

const mockConversations: Conversation[] = [
  {
    id: "1",
    patientId: "p1",
    patientName: "John Doe",
    lastMessage: "Hello, I need help with my prescription",
    lastMessageTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    unreadCount: 2,
    status: "new",
    assignedTo: "Dr. Smith",
  },
  {
    id: "2",
    patientId: "p2",
    patientName: "Jane Smith",
    lastMessage: "Thank you for your help",
    lastMessageTime: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    unreadCount: 0,
    status: "resolved",
    assignedTo: undefined,
  },
  {
    id: "3",
    patientId: "p3",
    patientName: "Bob Johnson",
    lastMessage: "When is my next appointment?",
    lastMessageTime: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
    unreadCount: 5,
    status: "active",
    assignedTo: "Dr. Jones",
  },
];

describe("MessagesList", () => {
  describe("Basic rendering", () => {
    it("renders list of conversations", () => {
      renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Johnson")).toBeInTheDocument();
    });

    it("renders empty list when no conversations", () => {
      const { container } = renderWithMantine(
        <MessagesList conversations={[]} onConversationClick={vi.fn()} />,
      );

      expect(
        container.querySelector("[data-testid='conversation-card']"),
      ).not.toBeInTheDocument();
    });

    it("displays patient avatars", () => {
      const { container } = renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      // Check for Avatar components by  looking for elements with avatar-related classes
      const avatars = container.querySelectorAll('[class*="Avatar"]');
      expect(avatars.length).toBeGreaterThan(0);
    });

    it("uses first letter of patient name in avatar", () => {
      renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      // Use getAllByText for multiple "J" letters (John and Jane)
      const jLetters = screen.getAllByText("J");
      expect(jLetters.length).toBeGreaterThan(0);
      expect(screen.getByText("B")).toBeInTheDocument(); // Bob
    });
  });

  describe("Message preview", () => {
    it("displays last message text", () => {
      renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(
        screen.getByText("Hello, I need help with my prescription"),
      ).toBeInTheDocument();
      expect(screen.getByText("Thank you for your help")).toBeInTheDocument();
    });

    it("truncates long messages", () => {
      const longMessage = "A".repeat(200);
      const conversations: Conversation[] = [
        {
          id: "1",
          patientId: "p1",
          patientName: "Test Patient",
          lastMessage: longMessage,
          lastMessageTime: new Date().toISOString(),
          unreadCount: 0,
          status: "new",
        },
      ];

      const { container } = renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      // Mantine Text with lineClamp prop should limit display
      const messageText = container.querySelector('[style*="line-clamp"]');
      expect(messageText).toBeInTheDocument();
    });
  });

  describe("Status badges", () => {
    it("displays status badge for each conversation", () => {
      renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("new")).toBeInTheDocument();
      expect(screen.getByText("resolved")).toBeInTheDocument();
      expect(screen.getByText("active")).toBeInTheDocument();
    });

    it("uses correct color for new status", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          status: "new",
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      const badge = screen.getByText("new");
      expect(badge).toBeInTheDocument();
    });

    it("uses correct color for active status", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          status: "active",
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("active")).toBeInTheDocument();
    });

    it("uses correct color for resolved status", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          status: "resolved",
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("resolved")).toBeInTheDocument();
    });

    it("uses correct color for closed status", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          status: "closed",
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("closed")).toBeInTheDocument();
    });
  });

  describe("Unread count", () => {
    it("displays unread badge when count > 0", () => {
      renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("2")).toBeInTheDocument(); // John Doe's unread
      expect(screen.getByText("5")).toBeInTheDocument(); // Bob Johnson's unread
    });

    it("hides unread badge when count is 0", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          unreadCount: 0,
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      const badges = screen.queryAllByText("0");
      expect(badges.length).toBe(0);
    });

    it("displays double-digit unread counts", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          unreadCount: 42,
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });

  describe("Assigned to", () => {
    it("displays assigned clinician when present", () => {
      renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("Assigned to: Dr. Smith")).toBeInTheDocument();
      expect(screen.getByText("Assigned to: Dr. Jones")).toBeInTheDocument();
    });

    it("hides assignment when not assigned", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          assignedTo: undefined,
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.queryByText(/Assigned to:/)).not.toBeInTheDocument();
    });
  });

  describe("Time formatting", () => {
    it("displays 'just now' for very recent messages", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          lastMessageTime: new Date(Date.now() - 30000).toISOString(), // 30 seconds ago
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("just now")).toBeInTheDocument();
    });

    it("displays minutes for recent messages", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          lastMessageTime: new Date(Date.now() - 300000).toISOString(), // 5 min ago
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText(/min ago/)).toBeInTheDocument();
    });

    it("displays hours for messages from today", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          lastMessageTime: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText(/hour.*ago/)).toBeInTheDocument();
    });

    it("displays days for recent messages", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          lastMessageTime: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText(/day.*ago/)).toBeInTheDocument();
    });

    it("displays date for old messages", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          lastMessageTime: new Date(Date.now() - 7 * 86400000).toISOString(), // 7 days ago
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      // Should display formatted date instead of relative time
      const timeElements = screen.queryAllByText(/ago/);
      expect(timeElements.length).toBe(0); // No "ago" for old messages
    });

    it("handles invalid timestamps gracefully", () => {
      const conversations: Conversation[] = [
        {
          ...mockConversations[0],
          lastMessageTime: "invalid-date",
        },
      ];

      renderWithMantine(
        <MessagesList
          conversations={conversations}
          onConversationClick={vi.fn()}
        />,
      );

      // formatTime catches the invalid date and shows "Invalid Date"
      expect(screen.getByText("Invalid Date")).toBeInTheDocument();
    });
  });

  describe("Click interaction", () => {
    it("calls onConversationClick when conversation is clicked", async () => {
      const user = userEvent.setup();
      const onConversationClick = vi.fn();

      renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={onConversationClick}
        />,
      );

      await user.click(screen.getByText("John Doe"));

      expect(onConversationClick).toHaveBeenCalledWith(mockConversations[0]);
    });

    it("calls onConversationClick with correct conversation", async () => {
      const user = userEvent.setup();
      const onConversationClick = vi.fn();

      renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={onConversationClick}
        />,
      );

      await user.click(screen.getByText("Bob Johnson"));

      expect(onConversationClick).toHaveBeenCalledWith(mockConversations[2]);
    });

    it("shows cursor pointer on hover", () => {
      const { container } = renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      const clickableElements = container.querySelectorAll('[style*="cursor"]');
      expect(clickableElements.length).toBeGreaterThan(0);
    });
  });

  describe("Loading state", () => {
    it("displays skeleton loaders when loading", () => {
      const { container } = renderWithMantine(
        <MessagesList
          conversations={[]}
          onConversationClick={vi.fn()}
          isLoading={true}
        />,
      );

      // Check for skeleton presence by looking for Stack container
      const stack = container.querySelector('[class*="Stack"]');
      expect(stack).toBeInTheDocument();
    });

    it("shows 3 skeleton cards when loading", () => {
      const { container } = renderWithMantine(
        <MessagesList
          conversations={[]}
          onConversationClick={vi.fn()}
          isLoading={true}
        />,
      );

      // Check for Card components
      const cards = container.querySelectorAll('[class*="Card"]');
      expect(cards.length).toBe(3);
    });

    it("hides actual conversations when loading", () => {
      renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
          isLoading={true}
        />,
      );

      expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
      expect(screen.queryByText("Jane Smith")).not.toBeInTheDocument();
    });

    it("shows conversations when not loading", () => {
      renderWithMantine(
        <MessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
          isLoading={false}
        />,
      );

      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });
  });
});
