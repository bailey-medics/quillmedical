/**
 * Foundations/Colours Story
 *
 * Visual reference for the app's semantic colour palette.
 * Documents brand colours, status colours, and text colours
 * so developers know which tokens to use.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, Box, Group, Stack, Text } from "@mantine/core";
import {
  brand,
  statusColours,
  textColours,
  type StatusColourName,
} from "@/styles/semanticColours";
import { primaryScale, secondaryScale, greyScale } from "@/theme";
import { StoryNote } from "@/stories/variants";
import PageHeader from "@components/page-header";

const meta: Meta = {
  title: "Foundations/Colours",
  parameters: {
    layout: "padded",
  },
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
        <StoryNote mt={0}>{label.toUpperCase()}</StoryNote>
        <StoryNote mt={0}>{description}</StoryNote>
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
      <StoryNote mt={0}>{config.usage}</StoryNote>
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
        <StoryNote mt={0}>{name.toUpperCase()}</StoryNote>
        <StoryNote mt={0}>
          {config.value} — {config.usage}
        </StoryNote>
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
        <PageHeader title="Brand colours" />
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
        <PageHeader title="Status colours" />
        <StoryNote>
          Used in badges, alerts, and form validation to communicate state.
        </StoryNote>
        <Stack gap="sm" mt="xl">
          {statusEntries.map(([name, config]) => (
            <StatusSwatch key={name} name={name} config={config} />
          ))}
        </Stack>
      </div>

      <div>
        <PageHeader title="Text colours" />
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
      <StoryNote mt={0}>{name.toUpperCase()}</StoryNote>
      <Group gap="md" align="flex-start" mt="xs">
        {scale.map((colour, i) => (
          <Stack key={i} gap={4} align="center">
            <Box
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                backgroundColor: colour,
                border: "1px solid var(--mantine-color-gray-3)",
              }}
            />
            <StoryNote mt={0}>{i}</StoryNote>
            <StoryNote mt={0}>{colour}</StoryNote>
            {i === primaryShade && <StoryNote mt={0}>DEFAULT</StoryNote>}
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
          <PageHeader title="Colour scales" />
          <StoryNote>
            10-shade ramps registered in the Mantine theme. Components use these
            via <code>color=&quot;primary&quot;</code> or{" "}
            <code>color=&quot;secondary&quot;</code>.
          </StoryNote>
          <Stack gap="lg" mt={20}>
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
            <ScaleRow
              name="grey (neutral)"
              scale={greyScale}
              primaryShade={0}
            />
          </Stack>
        </div>
      </Stack>
    );
  },
};
