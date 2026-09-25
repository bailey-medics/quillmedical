/**
 * Foundations/Emails Story
 *
 * Every email Quill sends, as the backend renders it, in both brand
 * themes. The renders are committed in `rendered/` by `just email-preview`
 * and checked against the templates by a backend test, so what is shown
 * here is what is sent. Each story shows the inbox line (sender, subject,
 * preheader and reply-to) above the email, in a sandboxed iframe so the
 * email's own styles cannot leak into Storybook or the other way round.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { StoryNote } from "@/stories/variants";
import {
  emailIds,
  emailLabels,
  renderedEmail,
  type EmailThemeName,
} from "./renderedEmails";
import classes from "./Emails.module.css";

type Device = "desktop" | "phone";
type Scheme = "light" | "dark";

interface EmailPreviewProps {
  /** Which email, by its preview id */
  email: string;
  theme: EmailThemeName;
  device: Device;
  scheme: Scheme;
}

function EmailPreview({ email, theme, device, scheme }: EmailPreviewProps) {
  const rendered = renderedEmail(email, theme, scheme === "dark");
  const [height, setHeight] = useState(600);

  return (
    <Stack gap="sm">
      <div>
        <Group gap="xs" wrap="nowrap">
          <Text fw={700} size="sm">
            {rendered.fromName}
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
      control: { type: "select", labels: emailLabels },
      options: emailIds,
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
  args: { email: "password-reset" },
};

export const PassportInvite: Story = {
  args: { email: "passport-invite" },
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
  args: { email: "certificate-without-logo" },
};

export const Newsletter: Story = {
  args: { email: "newsletter" },
};

export const LetsDoDigitalNewsletter: Story = {
  args: { email: "newsletter", theme: "ldd" },
};

export const OnAPhone: Story = {
  args: { email: "password-reset", device: "phone" },
};

export const DarkMode: Story = {
  args: { email: "passport-invite", scheme: "dark" },
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
