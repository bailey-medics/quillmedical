/**
 * MessagesList Component Tests
 *
 * Tests for the unified messages list component covering:
 * - Single vs multi-participant icon rendering
 * - Unread badge display
 * - Message previews and time formatting
 * - Click interactions
 * - Loading and empty states
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import MessagesList from "./MessagesList";
import type { MessageThread } from "./MessagesList";

const mockThreads: MessageThread[] = [
  {
    id: "1",
    displayName: "Sarah Johnson",
    profiles: [{ givenName: "Sarah", familyName: "Johnson", gradientIndex: 3 }],
    lastMessage: "Thank you for your help with my prescription",
    lastMessageTime: new Date(Date.now() - 3600000).toISOString(),
    unreadCount: 2,
  },
  {
    id: "2",
    displayName: "Dr Corbett, Gemma Corbett",
    profiles: [
      { givenName: "Gareth", familyName: "Corbett", gradientIndex: 5 },
      { givenName: "Gemma", familyName: "Corbett", gradientIndex: 12 },
    ],
    lastMessage: "I've reviewed your case notes",
    lastMessageTime: new Date(Date.now() - 86400000).toISOString(),
    unreadCount: 0,
  },
  {
    id: "3",
    displayName: "Dr Patel",
    profiles: [{ givenName: "Raj", familyName: "Patel", gradientIndex: 9 }],
    lastMessage: "Your referral has been processed",
    lastMessageTime: new Date(Date.now() - 1800000).toISOString(),
    unreadCount: 1,
  },
];

describe("MessagesList", () => {
  describe("Basic rendering", () => {
    it("renders list of threads", () => {
      renderWithMantine(
        <MessagesList threads={mockThreads} onThreadClick={vi.fn()} />,
      );

      expect(screen.getByText("Sarah Johnson")).toBeInTheDocument();
      expect(screen.getByText("Dr Corbett, Gemma Corbett")).toBeInTheDocument();
      expect(screen.getByText("Dr Patel")).toBeInTheDocument();
    });

    it("renders empty list when no threads", () => {
      const { container } = renderWithMantine(
        <MessagesList threads={[]} onThreadClick={vi.fn()} />,
      );

      expect(
        container.querySelector('[class*="Card"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe("Profile icons", () => {
    it("renders single ProfilePic for one-participant threads", () => {
      renderWithMantine(
        <MessagesList threads={[mockThreads[0]]} onThreadClick={vi.fn()} />,
      );

      // Single participant: ProfilePic shows two-letter initials
      expect(screen.getByText("SJ")).toBeInTheDocument();
    });

    it("renders StackedProfilePics for multi-participant threads", () => {
      renderWithMantine(
        <MessagesList threads={[mockThreads[1]]} onThreadClick={vi.fn()} />,
      );

      // Both Gareth Corbett and Gemma Corbett have initials "GC"
      const gcElements = screen.getAllByText("GC");
      expect(gcElements).toHaveLength(2);
    });
  });

  describe("Unread badge", () => {
    it("displays unread badge when count > 0", () => {
      renderWithMantine(
        <MessagesList threads={mockThreads} onThreadClick={vi.fn()} />,
      );

      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("hides unread badge when count is 0", () => {
      renderWithMantine(
        <MessagesList threads={[mockThreads[1]]} onThreadClick={vi.fn()} />,
      );

      const zeroBadges = screen.queryAllByText("0");
      expect(zeroBadges.length).toBe(0);
    });

    it("caps unread counts above 9 as 9+", () => {
      renderWithMantine(
        <MessagesList
          threads={[{ ...mockThreads[0], unreadCount: 42 }]}
          onThreadClick={vi.fn()}
        />,
      );

      expect(screen.getByText("9+")).toBeInTheDocument();
    });
  });

  describe("No status badges", () => {
    it("does not show status pills", () => {
      renderWithMantine(
        <MessagesList threads={mockThreads} onThreadClick={vi.fn()} />,
      );

      expect(screen.queryByText("new")).not.toBeInTheDocument();
      expect(screen.queryByText("active")).not.toBeInTheDocument();
      expect(screen.queryByText("resolved")).not.toBeInTheDocument();
      expect(screen.queryByText("closed")).not.toBeInTheDocument();
    });
  });

  describe("Message preview", () => {
    it("displays last message text", () => {
      renderWithMantine(
        <MessagesList threads={mockThreads} onThreadClick={vi.fn()} />,
      );

      expect(
        screen.getByText("Thank you for your help with my prescription"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("I've reviewed your case notes"),
      ).toBeInTheDocument();
    });
  });

  describe("Time formatting", () => {
    it("displays 'just now' for very recent messages", () => {
      renderWithMantine(
        <MessagesList
          threads={[
            {
              ...mockThreads[0],
              lastMessageTime: new Date(Date.now() - 30000).toISOString(),
            },
          ]}
          onThreadClick={vi.fn()}
        />,
      );

      expect(screen.getByText("just now")).toBeInTheDocument();
    });

    it("displays minutes for recent messages", () => {
      renderWithMantine(
        <MessagesList
          threads={[
            {
              ...mockThreads[0],
              lastMessageTime: new Date(Date.now() - 300000).toISOString(),
            },
          ]}
          onThreadClick={vi.fn()}
        />,
      );

      expect(screen.getByText(/min ago/)).toBeInTheDocument();
    });

    it("displays hours for messages from today", () => {
      renderWithMantine(
        <MessagesList
          threads={[
            {
              ...mockThreads[0],
              lastMessageTime: new Date(Date.now() - 7200000).toISOString(),
            },
          ]}
          onThreadClick={vi.fn()}
        />,
      );

      expect(screen.getByText(/hour.*ago/)).toBeInTheDocument();
    });

    it("displays days for recent messages", () => {
      renderWithMantine(
        <MessagesList
          threads={[
            {
              ...mockThreads[0],
              lastMessageTime: new Date(
                Date.now() - 2 * 86400000,
              ).toISOString(),
            },
          ]}
          onThreadClick={vi.fn()}
        />,
      );

      expect(screen.getByText(/day.*ago/)).toBeInTheDocument();
    });

    it("handles invalid timestamps gracefully", () => {
      renderWithMantine(
        <MessagesList
          threads={[{ ...mockThreads[0], lastMessageTime: "invalid-date" }]}
          onThreadClick={vi.fn()}
        />,
      );

      expect(screen.getByText("Invalid Date")).toBeInTheDocument();
    });
  });

  describe("Click interaction", () => {
    it("calls onThreadClick when thread is clicked", async () => {
      const user = userEvent.setup();
      const onThreadClick = vi.fn();

      renderWithMantine(
        <MessagesList threads={mockThreads} onThreadClick={onThreadClick} />,
      );

      await user.click(screen.getByText("Sarah Johnson"));
      expect(onThreadClick).toHaveBeenCalledWith(mockThreads[0]);
    });

    it("calls onThreadClick with correct thread", async () => {
      const user = userEvent.setup();
      const onThreadClick = vi.fn();

      renderWithMantine(
        <MessagesList threads={mockThreads} onThreadClick={onThreadClick} />,
      );

      await user.click(screen.getByText("Dr Patel"));
      expect(onThreadClick).toHaveBeenCalledWith(mockThreads[2]);
    });
  });

  describe("Loading state", () => {
    it("shows skeleton cards when loading", () => {
      const { container } = renderWithMantine(
        <MessagesList threads={[]} onThreadClick={vi.fn()} isLoading={true} />,
      );

      const cards = container.querySelectorAll('[class*="Card"]');
      expect(cards.length).toBe(3);
    });

    it("hides threads when loading", () => {
      renderWithMantine(
        <MessagesList
          threads={mockThreads}
          onThreadClick={vi.fn()}
          isLoading={true}
        />,
      );

      expect(screen.queryByText("Sarah Johnson")).not.toBeInTheDocument();
    });
  });
});
