import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import Messaging, { type Message } from "./Messaging";
import demoMessages from "./demoMessages";

const meta: Meta<typeof Messaging> = {
  title: "Message/Message",
  component: Messaging,
};

export default meta;

type Story = StoryObj<typeof Messaging>;

function Wrapper() {
  const [messages, setMessages] = useState<Message[]>(
    demoMessages as Message[]
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

export const Default: Story = {
  render: () => <Wrapper />,
};
