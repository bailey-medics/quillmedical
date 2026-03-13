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
import type { Conversation, Participant } from "@/pages/Messages";

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
    patientGivenName: "Sarah",
    patientFamilyName: "Johnson",
    patientGradientIndex: 3,
    lastMessage:
      "I've reviewed your case notes and endoscopy findings. Everything looks good.",
    lastMessageTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
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
    lastMessage:
      "Your referral to the gastroenterology clinic has been processed.",
    lastMessageTime: new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString(),
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
    lastMessage:
      "Your repeat prescription has been sent to your nominated pharmacy.",
    lastMessageTime: new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    unreadCount: 0,
    status: "closed",
    participants: [
      { displayName: "Pharmacy", givenName: "Pharmacy" },
      { displayName: "Dr Corbett", givenName: "Gareth", familyName: "Corbett" },
    ] satisfies Participant[],
  },
  {
    id: "4",
    patientId: "p1",
    patientName: "Sarah Johnson",
    patientGivenName: "Sarah",
    patientFamilyName: "Johnson",
    patientGradientIndex: 3,
    lastMessage: "A new message has been received regarding your appointment.",
    lastMessageTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    unreadCount: 1,
    status: "new",
    participants: [
      { displayName: "Dr Corbett", givenName: "Gareth", familyName: "Corbett" },
    ],
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
