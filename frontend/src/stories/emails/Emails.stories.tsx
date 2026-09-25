/**
 * Foundations/Emails Story
 *
 * Design-phase mock-ups of Quill's email template, in both brand themes.
 * Each story shows the inbox line (sender, subject and preheader) above the
 * email itself, rendered in a sandboxed iframe so the email's own styles
 * cannot leak into Storybook or the other way round.
 *
 * Nothing here is wired to the backend yet: see Phase 1 of
 * `docs/docs/plans/2026-09-25-email-branding-plan.md`.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { StoryNote } from "@/stories/variants";
import type { EmailMockupName } from "./mockups/content";
import { renderMockup } from "./mockups/renderMockup";
import type { EmailThemeName } from "./mockups/themes";
import classes from "./Emails.module.css";

type Device = "desktop" | "phone";
type Scheme = "light" | "dark";

interface EmailPreviewProps {
  email: EmailMockupName;
  theme: EmailThemeName;
  device: Device;
  scheme: Scheme;
}

function EmailPreview({ email, theme, device, scheme }: EmailPreviewProps) {
  const rendered = renderMockup(theme, email, { dark: scheme === "dark" });
  const [height, setHeight] = useState(600);

  return (
    <Stack gap="sm">
      <div>
        <Group gap="xs" wrap="nowrap">
          <Text fw={700} size="sm">
            {rendered.senderName}
          </Text>
        </Group>
        <Text size="sm" fw={600}>
          {rendered.subject}
        </Text>
        <StoryNote mt={0}>{rendered.preheader}</StoryNote>
      </div>
      <iframe
        // Remounts on every change, so the height is measured afresh
        key={`${theme}-${email}-${device}-${scheme}`}
        title={`${rendered.subject}, ${theme} theme`}
        className={`${classes.frame} ${classes[device]}`}
        height={height}
        sandbox="allow-same-origin"
        srcDoc={rendered.html}
        onLoad={(event) => {
          const doc = event.currentTarget.contentDocument;
          if (doc) {
            setHeight(doc.documentElement.scrollHeight);
          }
        }}
      />
    </Stack>
  );
}

const meta: Meta<typeof EmailPreview> = {
  title: "Foundations/Emails",
  component: EmailPreview,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    theme: {
      control: "inline-radio",
      options: ["quill", "ldd"],
      description: "Quill Medical, or Let's Do Digital",
    },
    email: {
      control: "select",
      options: ["passwordReset", "passportInvite", "newsletter"],
    },
    device: {
      control: "inline-radio",
      options: ["desktop", "phone"],
    },
    scheme: {
      control: "inline-radio",
      options: ["light", "dark"],
      description:
        "What a mail client that honours dark mode shows. Gmail and " +
        "Outlook apply their own inversion instead.",
    },
  },
  args: {
    theme: "quill",
    device: "desktop",
    scheme: "light",
  },
};

export default meta;
type Story = StoryObj<typeof EmailPreview>;

export const PasswordReset: Story = {
  args: { email: "passwordReset" },
};

export const PassportInvite: Story = {
  args: { email: "passportInvite" },
};

export const Newsletter: Story = {
  args: { email: "newsletter" },
};

export const LetsDoDigitalNewsletter: Story = {
  args: { email: "newsletter", theme: "ldd" },
};

export const OnAPhone: Story = {
  args: { email: "passwordReset", device: "phone" },
};

export const DarkMode: Story = {
  args: { email: "passportInvite", scheme: "dark" },
};

/** Both brands side by side, for comparing the same email. */
export const BothThemes: Story = {
  args: { email: "newsletter", device: "phone" },
  render: (args) => (
    <Group align="flex-start" gap="xl">
      <EmailPreview {...args} theme="quill" />
      <EmailPreview {...args} theme="ldd" />
    </Group>
  ),
};
