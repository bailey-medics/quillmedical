/**
 * Foundations/Colours Story
 *
 * Visual reference for the app's semantic colour palette.
 * Documents brand colours, status colours, text colours and placeholder
 * colours so developers know which tokens to use. The brand colours,
 * scales and logo are the brand Storybook is running (`just sb <brand>`),
 * from BrandFoundations.tsx; the rest are shared by every brand.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, Box, Group, Stack, Text } from "@mantine/core";
import {
  placeholderColours,
  statusColours,
  statusTextColour,
  textColours,
  type StatusColourName,
} from "@/styles/semanticColours";
import { greyScale } from "@/theme";
import {
  BrandColourSwatches,
  BrandLogos,
  BrandScales,
  ColourSwatch,
  ScaleRow,
} from "@/stories/BrandFoundations";
import { StoryNote } from "@/stories/variants";
import PageHeader from "@components/page-header";
import { TextField } from "@components/form";

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

function StatusSwatch({
  name,
  config,
}: {
  name: StatusColourName;
  config: { bg: string; fg: string; text: string; usage: string };
}) {
  return (
    <Group gap="md" align="center" wrap="nowrap">
      <Badge
        color={config.bg}
        c={statusTextColour(name)}
        variant="filled"
        size="lg"
      >
        {name}
      </Badge>
      {/* The same status as a word on the page, in `fg` */}
      <Text size="lg" fw={700} c={config.fg} miw="8rem">
        {name}
      </Text>
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
    <Group gap="md" align="center" wrap="nowrap">
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
          {config.value} - {config.usage}
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

const placeholderEntries = Object.entries(placeholderColours);

/** Full colour palette overview. */
export const Overview: Story = {
  render: () => (
    <Stack gap="xl">
      <div>
        <PageHeader title="Brand colours" />
        <Stack gap="md">
          <BrandColourSwatches />
          <ColourSwatch
            colour="#f8f9fa"
            label="Default grey"
            description="#f8f9fa - subtle backgrounds, input fills, hover states"
          />
        </Stack>
      </div>

      <BrandLogos />

      <div>
        <PageHeader title="Status colours" />
        <StoryNote>
          Used in badges, alerts, and form validation to communicate state. Each
          status has two colours. The fill (<code>bg</code>, left) is dark
          enough for white text and is the same in both schemes. The word, in
          the middle (<code>fg</code>), is for the status written as text with
          no fill behind it, and changes with the scheme: a darker shade in
          light mode, a pale one in dark. Never use <code>bg</code> for text.
        </StoryNote>
        <Stack gap="sm" mt="xl">
          {statusEntries.map(([name, config]) => (
            <StatusSwatch key={name} name={name} config={config} />
          ))}
        </Stack>
      </div>

      <div>
        <PageHeader title="Text colours" />
        <StoryNote>
          Every text colour meets WCAG AA contrast (4.5:1) in both schemes.
          Muted, link and error change with the colour scheme; switch the
          toolbar to see the dark values.
        </StoryNote>
        <Stack gap="md" mt="xl">
          {textEntries.map(([name, config]) => (
            <TextSwatch key={name} name={name} config={config} />
          ))}
        </Stack>
      </div>

      <div>
        <PageHeader title="Placeholder colours" />
        <StoryNote>
          The hint in an empty field. Fainter than any text colour on purpose,
          so neither meets 4.5:1 and neither is ever used for content: they are
          shown here where they belong, in a field. A field in error keeps its
          placeholder softer than its red border, so an empty field does not
          look as if something wrong was typed into it.
        </StoryNote>
        <Stack gap="lg" mt="xl">
          {placeholderEntries.map(([name, config]) => (
            // The field on the left and its notes on the right, as the
            // swatches above are laid out. Only on a screen too narrow
            // for both do the notes wrap beneath the field.
            <Group key={name} gap="md" align="center">
              <Box w="20rem">
                <TextField
                  label={
                    name === "error" ? "A field in error" : "An empty field"
                  }
                  placeholder="Placeholder text"
                  error={
                    name === "error" ? "This field is required" : undefined
                  }
                  // Nothing is typed here: the field is the sample
                  readOnly
                />
              </Box>
              {/* Takes the rest of the row and wraps its own words, so a
                  long note stays beside its field. Left to its natural
                  width, the error note was too wide for the row and
                  dropped beneath the field. */}
              <Box flex={1} miw="14rem">
                <StoryNote mt={0}>{name.toUpperCase()}</StoryNote>
                <StoryNote mt={0}>
                  {config.value} - {config.usage}
                </StoryNote>
              </Box>
            </Group>
          ))}
        </Stack>
      </div>
    </Stack>
  ),
};

/* ------------------------------------------------------------------ */
/*  Shade Scales                                                       */
/* ------------------------------------------------------------------ */

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
            <BrandScales />
            <ScaleRow
              name="grey (neutral)"
              scale={greyScale}
              primaryShade={0}
            />
            <StoryNote>
              Grey 7 is the only grey for text: it is the light-mode muted
              colour, 8.2:1 on white. Greys 4 to 6 fall below the 4.5:1 text
              minimum and are for icons, borders and placeholders only.
            </StoryNote>
          </Stack>
        </div>
      </Stack>
    );
  },
};
