/**
 * MessagesList Component Stories
 *
 * Demonstrates the conversations list component:
 * - List of patient conversations
 * - Unread message indicators
 * - Priority/status badges
 * - Click to open conversation
 * - Loading and empty states
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import MessagesList from "./MessagesList";
import type { Conversation } from "@/pages/Messages";

const meta: Meta<typeof MessagesList> = {
  title: "Messaging/MessagesList",
  component: MessagesList,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof MessagesList>;

const mockConversations: Conversation[] = [
  {
    id: "1",
    patientId: "p1",
    patientName: "Sarah Johnson",
    lastMessage:
      "Thank you for the letter, I've received it and will review with my GP.",
    lastMessageTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    unreadCount: 2,
    status: "new",
    assignedTo: undefined,
  },
  {
    id: "2",
    patientId: "p2",
    patientName: "Michael Brown",
    lastMessage:
      "I need a medical letter for my insurance claim. Can you help?",
    lastMessageTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    unreadCount: 0,
    status: "active",
    assignedTo: "Dr. Smith",
  },
  {
    id: "3",
    patientId: "p3",
    patientName: "Emily Wilson",
    lastMessage: "Could you send me a copy of my recent consultation notes?",
    lastMessageTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    unreadCount: 1,
    status: "active",
    assignedTo: "Dr. Jones",
  },
  {
    id: "4",
    patientId: "p4",
    patientName: "James Davis",
    lastMessage: "All sorted, thank you for your help!",
    lastMessageTime: new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString(), // 3 days ago
    unreadCount: 0,
    status: "resolved",
    assignedTo: "Dr. Smith",
  },
  {
    id: "5",
    patientId: "p5",
    patientName: "Olivia Martinez",
    lastMessage: "This case has been closed as requested.",
    lastMessageTime: new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString(), // 1 week ago
    unreadCount: 0,
    status: "closed",
    assignedTo: "Dr. Jones",
  },
];

export const Default: Story = {
  args: {
    conversations: mockConversations,
    onConversationClick: (conversation) => {
      console.log("Clicked conversation:", conversation);
    },
  },
};

export const Loading: Story = {
  args: {
    conversations: [],
    isLoading: true,
    onConversationClick: (conversation) => {
      console.log("Clicked conversation:", conversation);
    },
  },
};

export const NewMessages: Story = {
  args: {
    conversations: mockConversations.filter((conv) => conv.status === "new"),
    onConversationClick: (conversation) => {
      console.log("Clicked conversation:", conversation);
    },
  },
};

export const ActiveConversations: Story = {
  args: {
    conversations: mockConversations.filter((conv) => conv.status === "active"),
    onConversationClick: (conversation) => {
      console.log("Clicked conversation:", conversation);
    },
  },
};

export const WithUnreadOnly: Story = {
  args: {
    conversations: mockConversations.filter((conv) => conv.unreadCount > 0),
    onConversationClick: (conversation) => {
      console.log("Clicked conversation:", conversation);
    },
  },
};

export const ResolvedAndClosed: Story = {
  args: {
    conversations: mockConversations.filter(
      (conv) => conv.status === "resolved" || conv.status === "closed",
    ),
    onConversationClick: (conversation) => {
      console.log("Clicked conversation:", conversation);
    },
  },
};

export const Empty: Story = {
  args: {
    conversations: [],
    onConversationClick: (conversation) => {
      console.log("Clicked conversation:", conversation);
    },
  },
};

export const SingleConversation: Story = {
  args: {
    conversations: [mockConversations[0]],
    onConversationClick: (conversation) => {
      console.log("Clicked conversation:", conversation);
    },
  },
};

export const LongPatientName: Story = {
  args: {
    conversations: [
      {
        id: "long",
        patientId: "p99",
        patientName: "Alexander Bartholomew Christopher Davison-Edwards",
        lastMessage:
          "This is a very long message that should be truncated properly in the preview. It contains a lot of text to test the line clamping feature of the component.",
        lastMessageTime: new Date().toISOString(),
        unreadCount: 5,
        status: "new",
        assignedTo: "Dr. Elizabeth Smithson-Wellington",
      },
    ],
    onConversationClick: (conversation) => {
      console.log("Clicked conversation:", conversation);
    },
  },
};
