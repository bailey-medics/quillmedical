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
  /** For emails sent for a partner: show their logo, or only their name */
  partnerLogo: boolean;
}

function EmailPreview({
  email,
  theme,
  device,
  scheme,
  partnerLogo,
}: EmailPreviewProps) {
  const rendered = renderMockup(theme, email, {
    dark: scheme === "dark",
    partnerLogo,
  });
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
        {rendered.replyTo && (
          <StoryNote mt={0}>Reply to: {rendered.replyTo}</StoryNote>
        )}
      </div>
      <iframe
        // Remounts on every change, so the height is measured afresh
        key={`${theme}-${email}-${device}-${scheme}-${partnerLogo}`}
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
      options: ["passwordReset", "passportInvite", "certificate", "newsletter"],
    },
    partnerLogo: {
      control: "boolean",
      description:
        "Emails sent for a partner only. Off shows the partner's name " +
        "in place of their logo.",
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
    partnerLogo: true,
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

/**
 * A certificate sent for a partner, here EoEETA. Quill stays the sender;
 * the partner appears in a white strip under the header, in the sender
 * name ("EoEETA via Quill Medical") and as the reply-to address.
 */
export const EoeetaCertificate: Story = {
  args: { email: "certificate" },
};

/** The same, for a partner with no logo on file: their name stands in. */
export const EoeetaCertificateWithoutLogo: Story = {
  args: { email: "certificate", partnerLogo: false },
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
