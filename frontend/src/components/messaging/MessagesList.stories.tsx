/**
 * MessagesList Component Stories
 *
 * Demonstrates the unified messages list component:
 * - Single participant threads (ProfilePic icon)
 * - Multi-participant threads (StackedProfilePics)
 * - Unread badge display
 * - Loading state
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import MessagesList from "./MessagesList";
import type { MessageThread } from "./MessagesList";

const meta: Meta<typeof MessagesList> = {
  title: "Messaging/MessagesList",
  component: MessagesList,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof MessagesList>;

const mockThreads: MessageThread[] = [
  {
    id: "1",
    displayName: "Sarah Johnson",
    profiles: [{ givenName: "Sarah", familyName: "Johnson", gradientIndex: 0 }],
    lastMessage:
      "Thank you for the letter, I've received it and will review with my GP.",
    lastMessageTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    unreadCount: 2,
  },
  {
    id: "2",
    displayName: "Dr Corbett, Gemma Corbett",
    profiles: [
      { givenName: "Gareth", familyName: "Corbett", gradientIndex: 5 },
      { givenName: "Gemma", familyName: "Corbett", gradientIndex: 12 },
    ],
    lastMessage:
      "I've reviewed your case notes and endoscopy findings. Everything looks good.",
    lastMessageTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    unreadCount: 0,
  },
  {
    id: "3",
    displayName: "Emily Wilson",
    profiles: [{ givenName: "Emily", familyName: "Wilson", gradientIndex: 6 }],
    lastMessage: "Could you send me a copy of my recent consultation notes?",
    lastMessageTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    unreadCount: 1,
  },
  {
    id: "4",
    displayName: "Dr Patel",
    profiles: [{ givenName: "Raj", familyName: "Patel", gradientIndex: 9 }],
    lastMessage:
      "Your referral to the gastroenterology clinic has been processed.",
    lastMessageTime: new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    unreadCount: 0,
  },
  {
    id: "5",
    displayName: "Pharmacy, Dr Corbett",
    profiles: [
      { givenName: "Pharmacy" },
      { givenName: "Gareth", familyName: "Corbett", gradientIndex: 5 },
    ],
    lastMessage:
      "Your repeat prescription has been sent to your nominated pharmacy.",
    lastMessageTime: new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    unreadCount: 0,
  },
];

export const Default: Story = {
  args: {
    threads: mockThreads,
    onThreadClick: (thread) => {
      console.log("Clicked thread:", thread);
    },
  },
};

export const Loading: Story = {
  args: {
    threads: [],
    isLoading: true,
    onThreadClick: (thread) => {
      console.log("Clicked thread:", thread);
    },
  },
};

export const Empty: Story = {
  args: {
    threads: [],
    onThreadClick: (thread) => {
      console.log("Clicked thread:", thread);
    },
  },
};
