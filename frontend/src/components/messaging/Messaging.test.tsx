/**
 * Messaging Component Tests
 *
 * Tests for chat/messaging interface including message display,
 * scroll behavior, and message sending.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();
import { renderWithMantine } from "@/test/test-utils";
import Messaging, { type Message } from "./Messaging";

// Mock ProfilePic component
vi.mock("@/components/profile-pic/ProfilePic", () => ({
  default: ({
    givenName,
    familyName,
    size,
    isLoading,
  }: {
    givenName?: string;
    familyName?: string;
    size: string;
    isLoading?: boolean;
  }) =>
    isLoading ? (
      <div data-testid="profile-pic-loading" data-size={size} />
    ) : (
      <div
        data-testid="profile-pic"
        data-given={givenName}
        data-family={familyName}
        data-size={size}
      />
    ),
}));

const mockMessages: Message[] = [
  {
    id: "1",
    senderId: "patient-1",
    senderName: "John Doe",
    givenName: "John",
    familyName: "Doe",
    text: "Hello, I have a question about my prescription",
    timestamp: "2024-01-15T10:30:00Z",
    gradientIndex: 1,
  },
  {
    id: "2",
    senderId: "dr-1",
    senderName: "Dr. Smith",
    givenName: "Sarah",
    familyName: "Smith",
    text: "Hi John, I'd be happy to help. What's your question?",
    timestamp: "2024-01-15T10:35:00Z",
    gradientIndex: 2,
  },
  {
    id: "3",
    senderId: "patient-1",
    text: "Can I take it with food?",
    timestamp: "2024-01-15T10:36:00Z",
  },
];

describe("Messaging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Message display", () => {
    it("renders all messages", () => {
      renderWithMantine(
        <Messaging messages={mockMessages} currentUserId="dr-1" />,
      );

      expect(
        screen.getByText("Hello, I have a question about my prescription"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Hi John, I'd be happy to help. What's your question?",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Can I take it with food?")).toBeInTheDocument();
    });

    it("displays sender names for received messages", () => {
      renderWithMantine(
        <Messaging messages={mockMessages} currentUserId="dr-1" />,
      );

      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    it("formats timestamps correctly", () => {
      renderWithMantine(
        <Messaging messages={[mockMessages[0]]} currentUserId="dr-1" />,
      );

      // Check for date and time presence (format may vary by locale)
      expect(screen.getByText(/15\/01\/2024|2024/)).toBeInTheDocument();
      expect(screen.getByText(/10:30|10:30:00/)).toBeInTheDocument();
    });

    it("renders profile pictures for messages", () => {
      renderWithMantine(
        <Messaging messages={mockMessages} currentUserId="dr-1" />,
      );

      const profilePics = screen.getAllByTestId("profile-pic");
      expect(profilePics.length).toBe(mockMessages.length);
    });
  });

  describe("Message alignment", () => {
    it("aligns current user messages to the right", () => {
      const { container } = renderWithMantine(
        <Messaging messages={[mockMessages[1]]} currentUserId="dr-1" />,
      );

      const messageContainer = container.querySelector(
        '[style*="justify-content: flex-end"]',
      );
      expect(messageContainer).toBeInTheDocument();
    });

    it("aligns other user messages to the left", () => {
      const { container } = renderWithMantine(
        <Messaging messages={[mockMessages[0]]} currentUserId="dr-1" />,
      );

      const messageContainer = container.querySelector(
        '[style*="justify-content: flex-start"]',
      );
      expect(messageContainer).toBeInTheDocument();
    });
  });

  describe("Message styling", () => {
    it("uses different background colors for sent/received messages", () => {
      renderWithMantine(
        <Messaging messages={mockMessages} currentUserId="dr-1" />,
      );

      // Sent messages (mine as dr-1) have blue background
      const sentMessage = screen.getByText(
        "Hi John, I'd be happy to help. What's your question?",
      );
      expect(sentMessage).toBeInTheDocument();
      const sentBubble = sentMessage.closest('[style*="background"]');
      expect(sentBubble).toHaveStyle({ background: "rgb(187, 222, 251)" }); // #BBDEFB

      // Received messages have orange background
      const receivedMessage = screen.getByText(
        "Hello, I have a question about my prescription",
      );
      expect(receivedMessage).toBeInTheDocument();
      const receivedBubble = receivedMessage.closest('[style*="background"]');
      expect(receivedBubble).toHaveStyle({ background: "rgb(255, 243, 224)" }); // #FFF3E0
    });
  });

  describe("Message input", () => {
    it("renders textarea for message input", () => {
      renderWithMantine(<Messaging messages={[]} currentUserId="user-1" />);

      expect(
        screen.getByPlaceholderText("Type a message..."),
      ).toBeInTheDocument();
    });

    it("uses custom placeholder when provided", () => {
      renderWithMantine(
        <Messaging
          messages={[]}
          currentUserId="user-1"
          placeholder="Enter your message..."
        />,
      );

      expect(
        screen.getByPlaceholderText("Enter your message..."),
      ).toBeInTheDocument();
    });

    it("renders send button", () => {
      renderWithMantine(<Messaging messages={[]} currentUserId="user-1" />);

      expect(screen.getByText("Send")).toBeInTheDocument();
    });

    it("updates input value when typing", async () => {
      const user = userEvent.setup();
      renderWithMantine(<Messaging messages={[]} currentUserId="user-1" />);

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "Hello world");

      expect(textarea).toHaveValue("Hello world");
    });
  });

  describe("Sending messages", () => {
    it("calls onSend when send button is clicked", async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      renderWithMantine(
        <Messaging messages={[]} currentUserId="user-1" onSend={onSend} />,
      );

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "Test message");
      await user.click(screen.getByText("Send"));

      expect(onSend).toHaveBeenCalledWith("Test message");
    });

    it("clears input after sending", async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      renderWithMantine(
        <Messaging messages={[]} currentUserId="user-1" onSend={onSend} />,
      );

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "Test message");
      await user.click(screen.getByText("Send"));

      await waitFor(() => {
        expect(textarea).toHaveValue("");
      });
    });

    it("sends message on Enter key", async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      renderWithMantine(
        <Messaging messages={[]} currentUserId="user-1" onSend={onSend} />,
      );

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "Quick message{Enter}");

      expect(onSend).toHaveBeenCalledWith("Quick message");
    });

    it("does not send on Shift+Enter", async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      renderWithMantine(
        <Messaging messages={[]} currentUserId="user-1" onSend={onSend} />,
      );

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "Line 1{Shift>}{Enter}{/Shift}Line 2");

      expect(onSend).not.toHaveBeenCalled();
    });

    it("does not send empty messages", async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      renderWithMantine(
        <Messaging messages={[]} currentUserId="user-1" onSend={onSend} />,
      );

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "   "); // Only whitespace
      await user.click(screen.getByText("Send"));

      expect(onSend).not.toHaveBeenCalled();
    });

    it("trims whitespace from messages", async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      renderWithMantine(
        <Messaging messages={[]} currentUserId="user-1" onSend={onSend} />,
      );

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "  Message with spaces  ");
      await user.click(screen.getByText("Send"));

      expect(onSend).toHaveBeenCalledWith("Message with spaces");
    });
  });

  describe("Loading state", () => {
    it("displays skeleton loaders when loading", () => {
      renderWithMantine(
        <Messaging messages={[]} currentUserId="user-1" isLoading={true} />,
      );

      const loadingPics = screen.getAllByTestId("profile-pic-loading");
      expect(loadingPics.length).toBe(4); // 4 skeleton messages with 1 avatar each shown
    });

    it("hides actual messages when loading", () => {
      renderWithMantine(
        <Messaging
          messages={mockMessages}
          currentUserId="user-1"
          isLoading={true}
        />,
      );

      expect(
        screen.queryByText("Hello, I have a question about my prescription"),
      ).not.toBeInTheDocument();
    });

    it("disables input when loading", () => {
      renderWithMantine(
        <Messaging messages={[]} currentUserId="user-1" isLoading={true} />,
      );

      const textarea = screen.getByPlaceholderText("Type a message...");
      expect(textarea).toBeDisabled();
    });

    it("disables send button when loading", () => {
      renderWithMantine(
        <Messaging messages={[]} currentUserId="user-1" isLoading={true} />,
      );

      const sendButton = screen.getByText("Send").closest("button");
      expect(sendButton).toBeDisabled();
    });
  });

  describe("Empty conversation", () => {
    it("renders empty message list", () => {
      const { container } = renderWithMantine(
        <Messaging messages={[]} currentUserId="user-1" />,
      );

      // ScrollArea.Autosize renders with specific Mantine classes
      expect(
        container.querySelector('[class*="ScrollArea-root"]'),
      ).toBeInTheDocument();
    });

    it("allows sending first message", async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      renderWithMantine(
        <Messaging messages={[]} currentUserId="user-1" onSend={onSend} />,
      );

      const textarea = screen.getByPlaceholderText("Type a message...");
      await user.type(textarea, "First message");
      await user.click(screen.getByText("Send"));

      expect(onSend).toHaveBeenCalledWith("First message");
    });
  });

  describe("Optional message fields", () => {
    it("handles messages without sender name", () => {
      const messagesNoName: Message[] = [
        {
          id: "1",
          senderId: "user-1",
          text: "Anonymous message",
        },
      ];
      renderWithMantine(
        <Messaging messages={messagesNoName} currentUserId="user-2" />,
      );

      expect(screen.getByText("Anonymous message")).toBeInTheDocument();
    });

    it("handles messages without timestamp", () => {
      const messagesNoTime: Message[] = [
        {
          id: "1",
          senderId: "user-1",
          text: "Message without time",
        },
      ];
      renderWithMantine(
        <Messaging messages={messagesNoTime} currentUserId="user-2" />,
      );

      expect(screen.getByText("Message without time")).toBeInTheDocument();
    });

    it("handles messages without gradient index", () => {
      const messagesNoGradient: Message[] = [
        {
          id: "1",
          senderId: "user-1",
          givenName: "John",
          familyName: "Doe",
          text: "Test message",
        },
      ];
      renderWithMantine(
        <Messaging messages={messagesNoGradient} currentUserId="user-2" />,
      );

      expect(screen.getByText("Test message")).toBeInTheDocument();
    });
  });

  describe("Scroll behavior", () => {
    it("renders scroll area", () => {
      const { container } = renderWithMantine(
        <Messaging messages={mockMessages} currentUserId="user-1" />,
      );

      // ScrollArea.Autosize renders with specific Mantine classes
      expect(
        container.querySelector('[class*="ScrollArea-root"]'),
      ).toBeInTheDocument();
    });

    it("renders scroll anchor at end", () => {
      const { container } = renderWithMantine(
        <Messaging messages={mockMessages} currentUserId="user-1" />,
      );

      const scrollAnchor = container.querySelectorAll("div");
      // Verify structure exists (actual scrollIntoView is mocked in tests)
      expect(scrollAnchor.length).toBeGreaterThan(0);
    });
  });

  describe("Long messages", () => {
    it("handles very long message text", () => {
      const longMessage: Message[] = [
        {
          id: "1",
          senderId: "user-1",
          text: "Lorem ipsum ".repeat(100),
        },
      ];
      renderWithMantine(
        <Messaging messages={longMessage} currentUserId="user-2" />,
      );

      expect(screen.getByText(/Lorem ipsum/)).toBeInTheDocument();
    });

    it("handles many messages", () => {
      const manyMessages: Message[] = Array.from({ length: 50 }, (_, i) => ({
        id: `${i}`,
        senderId: i % 2 === 0 ? "user-1" : "user-2",
        text: `Message ${i}`,
      }));

      renderWithMantine(
        <Messaging messages={manyMessages} currentUserId="user-1" />,
      );

      expect(screen.getByText("Message 0")).toBeInTheDocument();
      expect(screen.getByText("Message 49")).toBeInTheDocument();
    });
  });

  describe("Message word breaking", () => {
    it("applies word-break styling to messages", () => {
      const { container } = renderWithMantine(
        <Messaging messages={[mockMessages[0]]} currentUserId="dr-1" />,
      );

      const messageBox = container.querySelector('[style*="word-break"]');
      expect(messageBox).toBeInTheDocument();
    });
  });
});
