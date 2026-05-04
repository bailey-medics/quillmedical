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
import { primaryScale, secondaryScale, greyScale } from "@/theme";

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
          border: "1px solid var(--mantine-color-gray-3)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          size="xl"
          fw={700}
          c={!isInherit && !isCssVar ? config.value : undefined}
          style={
            isInherit
              ? { color: "var(--mantine-color-text)" }
              : isCssVar
                ? { color: config.value }
                : undefined
          }
        >
          Aa
        </Text>
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
          <ColourSwatch
            colour="#f8f9fa"
            label="Default grey"
            description="#f8f9fa — subtle backgrounds, input fills, hover states"
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

/* ------------------------------------------------------------------ */
/*  Shade Scales                                                       */
/* ------------------------------------------------------------------ */

function ScaleRow({
  name,
  scale,
  primaryShade,
}: {
  name: string;
  scale: readonly string[];
  primaryShade?: number;
}) {
  return (
    <div>
      <Text size="md" fw={700} mb="xs">
        {name}
      </Text>
      <Group gap={0} align="flex-start">
        {scale.map((colour, i) => (
          <Stack key={i} gap={4} align="center" style={{ width: 64 }}>
            <Box
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                backgroundColor: colour,
                border: "1px solid var(--mantine-color-gray-3)",
              }}
            />
            <Text
              size="xs"
              c={i === primaryShade ? "black" : "dimmed"}
              fw={i === primaryShade ? 700 : undefined}
              ta="center"
            >
              {i}
            </Text>
            <Text
              size="xs"
              c={i === primaryShade ? "black" : "dimmed"}
              fw={i === primaryShade ? 700 : undefined}
              ta="center"
              style={{ fontSize: 9 }}
            >
              {colour}
            </Text>
            {i === primaryShade && (
              <Text size="xs" c="black" fw={700} ta="center">
                {name.split(" ")[0]} colour
              </Text>
            )}
          </Stack>
        ))}
      </Group>
    </div>
  );
}

/** Brand and accent 10-shade colour scales. Bold label marks the primaryShade. */
export const Scales: Story = {
  render: () => {
    return (
      <Stack gap="xl">
        <div>
          <Title order={2} mb="md">
            Colour scales
          </Title>
          <Text size="sm" c="dimmed" mb="lg">
            10-shade ramps registered in the Mantine theme. Components use these
            via <code>color=&quot;primary&quot;</code> or{" "}
            <code>color=&quot;secondary&quot;</code>. Bold label marks the brand
            colour.
          </Text>
          <Stack gap="lg">
            <ScaleRow
              name="primary (navy)"
              scale={primaryScale}
              primaryShade={8}
            />
            <ScaleRow
              name="secondary (amber)"
              scale={secondaryScale}
              primaryShade={5}
            />
            <ScaleRow name="grey (neutral)" scale={greyScale} />
          </Stack>
        </div>
      </Stack>
    );
  },
};
