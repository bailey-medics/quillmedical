/**
 * Foundations/Typography Story
 *
 * Visual reference for the app's typography system.
 * Shows every typography component with sample text and documents
 * the responsive font size scale.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Divider, Group, Stack, Text, Title } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import HeaderText from "@/components/typography/HeaderText";
import BodyTextBlack from "@/components/typography/BodyTextBlack";
import BodyTextBold from "@/components/typography/BodyTextBold";
import BodyText from "@/components/typography/BodyText";
import BodyTextClamp from "@/components/typography/BodyTextClamp";
import ErrorText from "@/components/typography/ErrorText";
import PlaceholderText from "@/components/typography/PlaceholderText";
import HyperlinkText from "@/components/typography/HyperlinkText";

const meta: Meta = {
  title: "Foundations/Typography",
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function TypeRow({
  label,
  details,
  children,
}: {
  label: string;
  details: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap={4}>
      <Group gap="sm" align="baseline">
        <Text size="sm" fw={700} style={{ minWidth: 140 }}>
          {label}
        </Text>
        <Text size="xs" c="dimmed">
          {details}
        </Text>
      </Group>
      <div>{children}</div>
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/*  Stories                                                            */
/* ------------------------------------------------------------------ */

/** All typography components rendered with sample text. */
export const ComponentShowcase: Story = {
  render: () => (
    <Stack gap="lg">
      <Title order={2}>Component showcase</Title>
      <Text size="sm" c="dimmed">
        Every typography component available in the app, shown with sample text.
      </Text>

      <Divider />

      <TypeRow label="PageHeader" details="Title h1 · xl · inherits · bold">
        <PageHeader title="Page header text" />
      </TypeRow>

      <Divider />

      <TypeRow label="HeaderText" details="Title h2 · lg · inherits · bold">
        <HeaderText>Header text example</HeaderText>
      </TypeRow>

      <Divider />

      <TypeRow
        label="BodyTextBlack"
        details='Text · lg · c="black" · normal · pre-wrap'
      >
        <BodyTextBlack>
          Body text in black — used for emphasised content that needs to stand
          out from the dimmed body text.
        </BodyTextBlack>
      </TypeRow>

      <Divider />

      <TypeRow label="BodyTextBold" details='Text · lg · c="black" · fw=700'>
        <BodyTextBold>
          Bold body text — used for key values, names, and important labels.
        </BodyTextBold>
      </TypeRow>

      <Divider />

      <TypeRow label="BodyText" details='Text · lg · c="dimmed" · normal'>
        <BodyText>
          Standard body text — the default for secondary content, descriptions,
          and supporting information throughout the app.
        </BodyText>
      </TypeRow>

      <Divider />

      <TypeRow
        label="BodyTextClamp"
        details='Text · lg · c="dimmed" · lineClamp'
      >
        <BodyTextClamp lineClamp={2}>
          Clamped body text truncates after a set number of lines. This is
          useful for message previews, card summaries, and any content that
          needs to fit a constrained space without overflowing. The ellipsis
          appears at the end of the last visible line.
        </BodyTextClamp>
      </TypeRow>

      <Divider />

      <TypeRow label="ErrorText" details='Text · lg · c="red" · fw=700'>
        <ErrorText>Something went wrong. Please try again.</ErrorText>
      </TypeRow>

      <Divider />

      <TypeRow label="PlaceholderText" details="Text · lg · placeholder colour">
        <PlaceholderText>Enter your name...</PlaceholderText>
      </TypeRow>

      <Divider />

      <TypeRow label="HyperlinkText" details="Anchor · lg · link colour">
        <HyperlinkText to="#">View patient record</HyperlinkText>
      </TypeRow>
    </Stack>
  ),
};

/** Responsive font size scale from theme.ts. */
export const FontSizeScale: Story = {
  render: () => (
    <Stack gap="lg">
      <Title order={2}>Font size scale</Title>
      <Text size="sm" c="dimmed">
        Responsive sizes scale up at the sm breakpoint (48em / 768px). Values
        shown as mobile → desktop.
      </Text>

      <Divider />

      <Stack gap="md">
        <Group gap="lg" align="baseline">
          <Text size="sm" fw={700} style={{ minWidth: 40 }}>
            xs
          </Text>
          <Text size="xs">The quick brown fox jumps over the lazy dog</Text>
          <Text size="xs" c="dimmed">
            0.875rem → 1rem (14px → 16px)
          </Text>
        </Group>

        <Group gap="lg" align="baseline">
          <Text size="sm" fw={700} style={{ minWidth: 40 }}>
            sm
          </Text>
          <Text size="sm">The quick brown fox jumps over the lazy dog</Text>
          <Text size="xs" c="dimmed">
            0.875rem → 1rem (14px → 16px)
          </Text>
        </Group>

        <Group gap="lg" align="baseline">
          <Text size="sm" fw={700} style={{ minWidth: 40 }}>
            md
          </Text>
          <Text size="md">The quick brown fox jumps over the lazy dog</Text>
          <Text size="xs" c="dimmed">
            1rem → 1.1875rem (16px → 19px)
          </Text>
        </Group>

        <Group gap="lg" align="baseline">
          <Text size="sm" fw={700} style={{ minWidth: 40 }}>
            lg
          </Text>
          <Text size="lg">The quick brown fox jumps over the lazy dog</Text>
          <Text size="xs" c="dimmed">
            1.25rem → 1.5rem (20px → 24px)
          </Text>
        </Group>

        <Group gap="lg" align="baseline">
          <Text size="sm" fw={700} style={{ minWidth: 40 }}>
            xl
          </Text>
          <Text size="xl">The quick brown fox jumps over the lazy dog</Text>
          <Text size="xs" c="dimmed">
            1.625rem → 2rem (26px → 32px)
          </Text>
        </Group>
      </Stack>
    </Stack>
  ),
};
