/**
 * Complete Layout Component Stories
 *
 * Demonstrates complete page layouts with all components integrated:
 * - Messaging interface within main layout
 * - Patient demographics display
 * - Letter viewing with markdown rendering
 * - Real-world application page examples
 */
import MarkdownView from "@/components/markdown";
import {
  Messaging,
  MessagesList,
  type Message,
  type MessageThread,
} from "@/components/messaging";
import demoMessages from "@/demo-data/messaging/demoMessages";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import MainLayout from "./MainLayout";

import { demoPatientsList } from "@/demo-data/patients/demoPatients";

const meta: Meta<typeof MainLayout> = {
  title: "Layouts/Layout-Complete",
  component: MainLayout,
  parameters: { layout: "fullscreen" },
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

// Simple Markdown sample built from lines so code fences are safe in-source
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
  args: { patient: demoPatientsList[0], isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <div style={{ padding: 16 }}>
        <MarkdownView source={mdSampleLines} />
      </div>
    </MainLayout>
  ),
};

// Lots of text to force vertical scrolling and exercise sticky headers
const LongContent = () => (
  <div style={{ flex: 1, padding: 24, color: "#374151" }}>
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 0.5rem" }}>An Extremely Long Read</h1>
      <p style={{ marginTop: 0, color: "#6b7280" }}>
        This page is intentionally verbose to test scrolling, sticky headers,
        and general layout behaviour inside <code>MainLayout</code>.
      </p>

      {[...Array(12)].map((_, i) => (
        <section key={i} style={{ margin: "1.25rem 0" }}>
          <h2 style={{ fontSize: 20, margin: "0 0 .5rem" }}>
            Section {i + 1}: Responsive Layout Considerations
          </h2>
          <p>
            In wider viewports we expect the search bar to remain visible
            alongside patient details. When space becomes constrained, the
            layout should gracefully collapse. Container queries let components
            adapt to the width they actually have, rather than guessing via the
            viewport.
          </p>
          <p>
            Real-world interfaces need to cope with split views, drawers, and
            odd aspect ratios. That’s why component-level responsiveness is such
            a reliable default. It avoids brittle assumptions and keeps
            components portable.
          </p>
          <ul>
            <li>Use container queries for visual changes.</li>
            <li>
              Use a ResizeObserver-based hook for JS behaviour tied to component
              width.
            </li>
            <li>Reserve global breakpoint context for app-shell decisions.</li>
          </ul>
          <p>Here is a tiny code sample to illustrate the point:</p>
          <pre
            style={{
              background: "#0b1020",
              color: "#e5e7eb",
              padding: 12,
              borderRadius: 8,
              overflowX: "auto",
            }}
          >
            {`@container (max-width: 640px) {
  .search { display: none; }
  .burger { display: inline-flex; }
}`}
          </pre>
          <p>
            As the section continues, imagine a stream of clinical notes,
            letters, tasks, and audit trails—enough content to ensure the page
            scrolls and your ribbon remains pinned to the top if{" "}
            <code>sticky</code> is enabled.
          </p>
        </section>
      ))}

      <h2 style={{ marginTop: "2rem" }}>Summary</h2>
      <p>
        If you can scroll comfortably and the header stays put, your sticky
        handling works. If the search hides on narrow widths and reappears when
        there’s room, your container queries are doing their job.
      </p>
    </div>
  </div>
);

export const LongRead: Story = {
  args: { patient: demoPatientsList[0], isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <LongContent />
    </MainLayout>
  ),
};
