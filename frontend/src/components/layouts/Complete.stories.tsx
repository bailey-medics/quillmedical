/**
 * Complete Layout Component Stories
 *
 * Demonstrates complete page layouts with all components integrated:
 * - Messaging interface within main layout
 * - Patient demographics display
 * - Patient list with navigation
 * - Letter viewing with markdown rendering
 * - Real-world application page examples
 */
import MarkdownView from "@/components/markdown/MarkdownView";
import Messaging, { type Message } from "@/components/messaging/Messaging";
import DemographicsDetailed from "@/components/demographics/DemographicsDetailed";
import PatientsList from "@/components/patients/PatientsList";
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

export const WithPatientList: Story = {
  args: { patient: null, isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <PatientsList patients={demoPatientsList} />
    </MainLayout>
  ),
};

export const WithPatientDemographics: Story = {
  args: { patient: demoPatientsList[0], isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <div style={{ padding: 16 }}>
        <DemographicsDetailed patient={demoPatientsList[0]} />
      </div>
    </MainLayout>
  ),
};

export const WithMessaging: Story = {
  args: { patient: demoPatientsList[0], isLoading: false },
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
