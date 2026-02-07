/**
 * Messaging Component Stories
 *
 * Demonstrates the messaging/chat interface component showing:
 * - Conversation thread with sent/received messages
 * - Message input with send functionality
 * - Loading states
 * - Real-time message updates
 */
import demoMessages from "@/demo-data/messaging/demoMessages";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import Messaging, { type Message } from "./Messaging";

const meta: Meta<typeof Messaging> = {
  title: "Messaging/Messaging",
  component: Messaging,
};

export default meta;

type Story = StoryObj<typeof Messaging>;

/**
 * Wrapper component providing stateful message management.
 * Simulates real message sending by appending to the message list.
 */
function Wrapper() {
  const [messages, setMessages] = useState<Message[]>(
    demoMessages as Message[],
  );

  return (
    <div style={{ height: 400 }}>
      <Messaging
        messages={messages}
        currentUserId="me"
        onSend={(text) =>
          setMessages((m) => [
            ...m,
            {
              id: String(m.length + 1),
              senderId: "me",
              text,
              timestamp: new Date().toISOString(),
            },
          ])
        }
      />
    </div>
  );
}

/**
 * Default messaging view with demo conversation.
 * Shows a thread of messages with send functionality.
 * Type a message and click send to add it to the conversation.
 */
export const Default: Story = {
  render: () => <Wrapper />,
};

/**
 * Loading state while fetching messages.
 * Shows skeleton loaders where messages would appear.
 */
export const Loading: Story = {
  render: () => (
    <div style={{ height: 400 }}>
      <Messaging messages={[]} currentUserId="me" isLoading={true} />
    </div>
  ),
};
