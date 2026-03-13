/**
 * PatientMessagesList Component Tests
 *
 * Tests for patient-specific conversation list display.
 * Verifies that clinician/staff names are shown instead of patient names.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import PatientMessagesList from "./PatientMessagesList";
import type { Conversation, Participant } from "@/pages/Messages";

const mockConversations: Conversation[] = [
  {
    id: "1",
    patientId: "p1",
    patientName: "Sarah Johnson",
    patientGivenName: "Sarah",
    patientFamilyName: "Johnson",
    patientGradientIndex: 3,
    lastMessage: "I've reviewed your case notes",
    lastMessageTime: new Date(Date.now() - 3600000).toISOString(),
    unreadCount: 2,
    status: "active",
    participants: [
      { displayName: "Dr Corbett", givenName: "Gareth", familyName: "Corbett" },
      {
        displayName: "Gemma Corbett",
        givenName: "Gemma",
        familyName: "Corbett",
      },
    ] satisfies Participant[],
  },
  {
    id: "2",
    patientId: "p1",
    patientName: "Sarah Johnson",
    patientGivenName: "Sarah",
    patientFamilyName: "Johnson",
    patientGradientIndex: 3,
    lastMessage: "Your referral has been processed",
    lastMessageTime: new Date(Date.now() - 86400000).toISOString(),
    unreadCount: 0,
    status: "resolved",
    participants: [
      { displayName: "Dr Patel", givenName: "Raj", familyName: "Patel" },
    ] satisfies Participant[],
  },
  {
    id: "3",
    patientId: "p1",
    patientName: "Sarah Johnson",
    patientGivenName: "Sarah",
    patientFamilyName: "Johnson",
    patientGradientIndex: 3,
    lastMessage: "Prescription sent to pharmacy",
    lastMessageTime: new Date(Date.now() - 1800000).toISOString(),
    unreadCount: 1,
    status: "new",
    participants: [
      { displayName: "Lisa Taylor", givenName: "Lisa", familyName: "Taylor" },
    ] satisfies Participant[],
  },
];

describe("PatientMessagesList", () => {
  describe("Display names", () => {
    it("shows participant names instead of patient name", () => {
      renderWithMantine(
        <PatientMessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("Dr Corbett, Gemma Corbett")).toBeInTheDocument();
      expect(screen.getByText("Dr Patel")).toBeInTheDocument();
    });

    it("does not show patient name", () => {
      renderWithMantine(
        <PatientMessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.queryByText("Sarah Johnson")).not.toBeInTheDocument();
    });

    it("shows participant initials in stacked profile icons", () => {
      renderWithMantine(
        <PatientMessagesList
          conversations={[mockConversations[0]]}
          onConversationClick={vi.fn()}
        />,
      );

      // Both Gareth Corbett and Gemma Corbett have initials "GC"
      const gcElements = screen.getAllByText("GC");
      expect(gcElements).toHaveLength(2);
    });

    it("renders profile icon from participants", () => {
      renderWithMantine(
        <PatientMessagesList
          conversations={[mockConversations[2]]}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("LT")).toBeInTheDocument();
    });
  });

  describe("Unread count", () => {
    it("displays unread badge when count > 0", () => {
      renderWithMantine(
        <PatientMessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("hides unread badge when count is 0", () => {
      renderWithMantine(
        <PatientMessagesList
          conversations={[mockConversations[1]]}
          onConversationClick={vi.fn()}
        />,
      );

      const zeroBadges = screen.queryAllByText("0");
      expect(zeroBadges.length).toBe(0);
    });
  });

  describe("Message preview", () => {
    it("displays last message text", () => {
      renderWithMantine(
        <PatientMessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(
        screen.getByText("I've reviewed your case notes"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Your referral has been processed"),
      ).toBeInTheDocument();
    });
  });

  describe("No 'Assigned to' label", () => {
    it("does not show 'Assigned to' text since the name is already the heading", () => {
      renderWithMantine(
        <PatientMessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.queryByText(/Assigned to:/)).not.toBeInTheDocument();
    });
  });

  describe("Click interaction", () => {
    it("calls onConversationClick when conversation is clicked", async () => {
      const user = userEvent.setup();
      const onConversationClick = vi.fn();

      renderWithMantine(
        <PatientMessagesList
          conversations={mockConversations}
          onConversationClick={onConversationClick}
        />,
      );

      await user.click(screen.getByText("Dr Corbett, Gemma Corbett"));
      expect(onConversationClick).toHaveBeenCalledWith(mockConversations[0]);
    });

    it("calls onConversationClick with correct conversation", async () => {
      const user = userEvent.setup();
      const onConversationClick = vi.fn();

      renderWithMantine(
        <PatientMessagesList
          conversations={mockConversations}
          onConversationClick={onConversationClick}
        />,
      );

      await user.click(screen.getByText("Dr Patel"));
      expect(onConversationClick).toHaveBeenCalledWith(mockConversations[1]);
    });
  });

  describe("Loading state", () => {
    it("shows skeleton cards when loading", () => {
      const { container } = renderWithMantine(
        <PatientMessagesList
          conversations={[]}
          onConversationClick={vi.fn()}
          isLoading={true}
        />,
      );

      const cards = container.querySelectorAll('[class*="Card"]');
      expect(cards.length).toBe(3);
    });

    it("hides conversations when loading", () => {
      renderWithMantine(
        <PatientMessagesList
          conversations={mockConversations}
          onConversationClick={vi.fn()}
          isLoading={true}
        />,
      );

      expect(
        screen.queryByText("Dr Corbett, Gemma Corbett"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("renders empty list when no conversations", () => {
      const { container } = renderWithMantine(
        <PatientMessagesList
          conversations={[]}
          onConversationClick={vi.fn()}
        />,
      );

      expect(
        container.querySelector('[class*="Card"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe("Time formatting", () => {
    it("displays relative time for recent messages", () => {
      renderWithMantine(
        <PatientMessagesList
          conversations={[
            {
              ...mockConversations[0],
              lastMessageTime: new Date(
                Date.now() - 2 * 60 * 60 * 1000,
              ).toISOString(),
            },
          ]}
          onConversationClick={vi.fn()}
        />,
      );

      expect(screen.getByText(/hour.*ago/)).toBeInTheDocument();
    });
  });
});
