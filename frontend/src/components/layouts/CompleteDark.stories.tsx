/**
 * Complete Layout Dark Mode Stories
 *
 * Dark-mode variants of all Layout-Complete stories.
 * Sets colorScheme global to "dark" so the Storybook decorator
 * applies forceColorScheme="dark" on the MantineProvider.
 */
import MarkdownView from "@/components/markdown";
import BodyText from "@/components/typography/BodyText";
import Heading from "@/components/typography/Heading";
import PageHeader from "@/components/typography/PageHeader";
import { typographyTokens } from "@/theme";
import {
  Messaging,
  MessagesList,
  type Message,
  type MessageThread,
} from "@/components/messaging";
import demoMessages from "@/demo-data/messaging/demoMessages";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container, Stack, List } from "@mantine/core";
import { useState } from "react";
import MainLayout from "./MainLayout";

import { demoPatientsList } from "@/demo-data/patients/demoPatients";

const meta: Meta<typeof MainLayout> = {
  title: "Layouts/Layout-Complete-Dark",
  component: MainLayout,
  parameters: { layout: "fullscreen" },
  globals: { colorScheme: "dark" },
};

export default meta;
type Story = StoryObj<typeof MainLayout>;

const mockThreads: MessageThread[] = [
  {
    id: "1",
    displayName: "Dr Williams",
    profiles: [
      { givenName: "David", familyName: "Williams", gradientIndex: 5 },
    ],
    lastMessage:
      "Thank you for the letter, I've received it and will review with my GP.",
    lastMessageTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    unreadCount: 2,
  },
  {
    id: "2",
    displayName: "Dr Smith",
    profiles: [{ givenName: "James", familyName: "Smith", gradientIndex: 9 }],
    lastMessage:
      "I need a medical letter for my insurance claim. Can you help?",
    lastMessageTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    unreadCount: 0,
  },
  {
    id: "3",
    displayName: "Dr Jones",
    profiles: [
      { givenName: "Eleanor", familyName: "Jones", gradientIndex: 12 },
    ],
    lastMessage: "Could you send me a copy of my recent consultation notes?",
    lastMessageTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    unreadCount: 1,
  },
];

export const WithPatientMessageList: Story = {
  tags: ["!test"],
  args: {
    patient: demoPatientsList[0],
    isLoading: false,
    patientNav: [
      {
        label: demoPatientsList[0].name,
        href: `/patients/${demoPatientsList[0].id}`,
      },
      {
        label: "Messages",
        href: `/patients/${demoPatientsList[0].id}/messages`,
      },
    ],
  },
  parameters: { routerPath: `/patients/${demoPatientsList[0].id}/messages` },
  render: (args) => (
    <MainLayout {...args}>
      <div style={{ padding: 16 }}>
        <MessagesList
          threads={mockThreads}
          onThreadClick={(thread) => console.log("Clicked:", thread.id)}
        />
      </div>
    </MainLayout>
  ),
};

export const WithMessaging: Story = {
  tags: ["!test"],
  args: {
    patient: demoPatientsList[0],
    isLoading: false,
    patientNav: [
      {
        label: demoPatientsList[0].name,
        href: `/patients/${demoPatientsList[0].id}`,
      },
      {
        label: "Messages",
        href: `/patients/${demoPatientsList[0].id}/messages`,
      },
      {
        label: "Dr Corbett, Gemma",
        href: `/patients/${demoPatientsList[0].id}/messages/gastro-clinic`,
      },
    ],
  },
  parameters: {
    routerPath: `/patients/${demoPatientsList[0].id}/messages/gastro-clinic`,
  },
  render: (args) => {
    function MessagingContent() {
      const [messages, setMessages] = useState<Message[]>(
        demoMessages as Message[],
      );

      return (
        <Messaging
          messages={messages}
          currentUserId="me"
          onSend={(text: string) =>
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
      );
    }

    return (
      <MainLayout {...args}>
        <MessagingContent />
      </MainLayout>
    );
  },
};

const mdSampleLines = [
  "# Consultation summary",
  "",
  "This is a short example of a clinical letter. It includes **bold** and *italic* text, a link to [example](https://example.com), and a code block:",
  "",
  "```",
  "print('hello world')",
  "```",
  "",
  "- Follow up: bloods",
  "- Action: review results",
].join("\n");

export const WithMarkdown: Story = {
  tags: ["!test"],
  args: { patient: demoPatientsList[0], isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <div style={{ padding: 16 }}>
        <MarkdownView source={mdSampleLines} />
      </div>
    </MainLayout>
  ),
};

const LongContent = () => (
  <Container size="lg" py="xl">
    <Stack gap="lg">
      <PageHeader title="An extremely long read" />

      {[...Array(12)].map((_, i) => (
        <Stack key={i} gap="sm">
          <Heading>Section {i + 1}: Responsive layout considerations</Heading>
          <BodyText>
            In wider viewports we expect the search bar to remain visible
            alongside patient details. When space becomes constrained, the
            layout should gracefully collapse. Container queries let components
            adapt to the width they actually have, rather than guessing via the
            viewport.
          </BodyText>
          <BodyText>
            Real-world interfaces need to cope with split views, drawers, and
            odd aspect ratios. That’s why component-level responsiveness is such
            a reliable default. It avoids brittle assumptions and keeps
            components portable.
          </BodyText>
          <List size="md" fw={typographyTokens.fontWeights.body}>
            <List.Item>Use container queries for visual changes.</List.Item>
            <List.Item>
              Use a ResizeObserver-based hook for JS behaviour tied to component
              width.
            </List.Item>
            <List.Item>
              Reserve global breakpoint context for app-shell decisions.
            </List.Item>
          </List>
          <BodyText>
            As the section continues, imagine a stream of clinical notes,
            letters, tasks, and audit trails—enough content to ensure the page
            scrolls and your ribbon remains pinned to the top if sticky is
            enabled.
          </BodyText>
        </Stack>
      ))}

      <Heading>Summary</Heading>
      <BodyText>
        If you can scroll comfortably and the header stays put, your sticky
        handling works. If the search hides on narrow widths and reappears when
        there’s room, your container queries are doing their job.
      </BodyText>
    </Stack>
  </Container>
);

export const LongRead: Story = {
  tags: ["!test"],
  args: { patient: demoPatientsList[0], isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <LongContent />
    </MainLayout>
  ),
};
