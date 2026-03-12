/**
 * PatientMessagesList Component Stories
 *
 * Demonstrates the patient-specific conversations list:
 * - Shows clinician/staff names instead of patient name
 * - Unread message indicators
 * - Status badges
 * - Click to open conversation
 * - Loading and empty states
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import PatientMessagesList from "./PatientMessagesList";
import type { Conversation } from "@/pages/Messages";

const meta: Meta<typeof PatientMessagesList> = {
  title: "Messaging/PatientMessagesList",
  component: PatientMessagesList,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof PatientMessagesList>;

const mockConversations: Conversation[] = [
  {
    id: "1",
    patientId: "p1",
    patientName: "Sarah Johnson",
    lastMessage:
      "I've reviewed your case notes and endoscopy findings. Everything looks good.",
    lastMessageTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    unreadCount: 2,
    status: "active",
    assignedTo: "Dr Corbett",
    participants: ["Dr Corbett", "Gemma"],
  },
  {
    id: "2",
    patientId: "p1",
    patientName: "Sarah Johnson",
    lastMessage:
      "Your referral to the gastroenterology clinic has been processed.",
    lastMessageTime: new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    unreadCount: 0,
    status: "resolved",
    assignedTo: "Dr Patel",
    participants: ["Dr Patel"],
  },
  {
    id: "3",
    patientId: "p1",
    patientName: "Sarah Johnson",
    lastMessage:
      "Your repeat prescription has been sent to your nominated pharmacy.",
    lastMessageTime: new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    unreadCount: 0,
    status: "closed",
    assignedTo: "Pharmacy",
    participants: ["Pharmacy", "Dr Corbett"],
  },
  {
    id: "4",
    patientId: "p1",
    patientName: "Sarah Johnson",
    lastMessage: "A new message has been received regarding your appointment.",
    lastMessageTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    unreadCount: 1,
    status: "new",
    assignedTo: undefined,
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

export const WithUnread: Story = {
  args: {
    conversations: mockConversations.filter((conv) => conv.unreadCount > 0),
    onConversationClick: (conversation) => {
      console.log("Clicked conversation:", conversation);
    },
  },
};

export const AllResolved: Story = {
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

export const UnassignedConversation: Story = {
  args: {
    conversations: [mockConversations[3]],
    onConversationClick: (conversation) => {
      console.log("Clicked conversation:", conversation);
    },
  },
};
