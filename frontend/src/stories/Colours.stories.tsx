/**
 * Foundations/Colours Story
 *
 * Visual reference for the app's semantic colour palette.
 * Documents brand colours, status colours, and text colours
 * so developers know which tokens to use.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, Box, Group, Stack, Text, Title } from "@mantine/core";
import {
  brand,
  statusColours,
  textColours,
  type StatusColourName,
} from "@/styles/semanticColours";

const meta: Meta = {
  title: "Foundations/Colours",
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

function ColourSwatch({
  colour,
  label,
  description,
}: {
  colour: string;
  label: string;
  description: string;
}) {
  return (
    <Group gap="md" align="center">
      <Box
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          backgroundColor: colour,
          border: "1px solid var(--mantine-color-gray-3)",
          flexShrink: 0,
        }}
      />
      <div>
        <Text size="md" fw={700}>
          {label}
        </Text>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      </div>
    </Group>
  );
}

function StatusSwatch({
  name,
  config,
}: {
  name: string;
  config: { bg: string; text: string; usage: string };
}) {
  return (
    <Group gap="md" align="center">
      <Badge color={config.bg} c={config.text} variant="filled" size="lg">
        {name}
      </Badge>
      <Text size="sm" c="dimmed">
        {config.usage}
      </Text>
    </Group>
  );
}

function TextSwatch({
  name,
  config,
}: {
  name: string;
  config: { value: string; usage: string };
}) {
  const isInherit = config.value === "inherit";
  const isCssVar = config.value.startsWith("var(");

  return (
    <Group gap="md" align="center">
      <Box
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          backgroundColor: isCssVar
            ? config.value
            : isInherit
              ? "black"
              : undefined,
          border: "1px solid var(--mantine-color-gray-3)",
          flexShrink: 0,
        }}
      >
        {!isCssVar && !isInherit && (
          <Text
            size="xl"
            fw={700}
            c={config.value}
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Aa
          </Text>
        )}
      </Box>
      <div>
        <Text size="md" fw={700}>
          {name}
        </Text>
        <Text size="sm" c="dimmed">
          {config.value} — {config.usage}
        </Text>
      </div>
    </Group>
  );
}

/* ------------------------------------------------------------------ */
/*  Stories                                                            */
/* ------------------------------------------------------------------ */

const statusEntries = Object.entries(statusColours) as [
  StatusColourName,
  (typeof statusColours)[StatusColourName],
][];

const textEntries = Object.entries(textColours);

/** Full colour palette overview. */
export const Overview: Story = {
  render: () => (
    <Stack gap="xl">
      <div>
        <Title order={2} mb="md">
          Brand colours
        </Title>
        <Stack gap="md">
          <ColourSwatch
            colour={brand.primary}
            label="Primary"
            description={`${brand.primary} — navigation, primary actions, brand identity`}
          />
          <ColourSwatch
            colour={brand.secondary}
            label="Secondary"
            description={`${brand.secondary} — secondary buttons, accents, highlights`}
          />
          <ColourSwatch
            colour={brand.background}
            label="Background"
            description={`${brand.background} — page backgrounds, card surfaces`}
          />
        </Stack>
      </div>

      <div>
        <Title order={2} mb="md">
          Status colours
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Used in badges, alerts, and form validation to communicate state.
        </Text>
        <Stack gap="sm">
          {statusEntries.map(([name, config]) => (
            <StatusSwatch key={name} name={name} config={config} />
          ))}
        </Stack>
      </div>

      <div>
        <Title order={2} mb="md">
          Text colours
        </Title>
        <Stack gap="md">
          {textEntries.map(([name, config]) => (
            <TextSwatch key={name} name={name} config={config} />
          ))}
        </Stack>
      </div>
    </Stack>
  ),
};
