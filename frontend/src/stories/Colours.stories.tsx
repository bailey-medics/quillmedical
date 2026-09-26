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
  statusTextColour,
  textColours,
  type StatusColourName,
} from "@/styles/semanticColours";
import { primaryScale, secondaryScale, greyScale } from "@/theme";
import { StoryNote } from "@/stories/variants";
import PageHeader from "@components/page-header";
import Image from "@components/images/Image";

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
    <Group gap="md" align="center" wrap="nowrap">
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
          {config.value} — {config.usage}
        </StoryNote>
      </div>
    </Group>
  );
}

/**
 * One version of the quill mark or wordmark, on the background it is
 * drawn for. `height` and `width` are rem; the tile is 6rem tall.
 */
function LogoSwatch({
  src,
  alt,
  height,
  width = 6,
  inset = 0.75,
  background,
  label,
  colours,
  usage,
}: {
  src: string;
  alt: string;
  height: number;
  width?: number;
  inset?: number;
  background: string;
  label: string;
  colours: string;
  usage: string;
}) {
  const onWhite = background === brand.background;
  return (
    <Group gap="md" align="center" wrap="nowrap">
      <Box
        style={{
          width: `${width}rem`,
          height: "6rem",
          borderRadius: 8,
          backgroundColor: background,
          border: onWhite ? "1px solid var(--mantine-color-gray-3)" : undefined,
          padding: `${inset}rem`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Image src={src} alt={alt} height={height} />
      </Box>
      <div>
        <StoryNote mt={0}>{label.toUpperCase()}</StoryNote>
        <StoryNote mt={0}>
          {colours} — {usage}
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
            colour={brand.mark}
            label="Mark"
            description={`${brand.mark} — the quill on a navy tile: the email avatar and the installed app's icon. Light grey, not white, so the mark sits back from the navy`}
          />
          <ColourSwatch
            colour="#f8f9fa"
            label="Default grey"
            description="#f8f9fa — subtle backgrounds, input fills, hover states"
          />
        </Stack>
      </div>

      <div>
        <PageHeader title="Quill logo" />
        <StoryNote>
          The mark is the feather; the wordmark is the name. Each is a PNG in{" "}
          <code>frontend/public</code>, drawn in one colour for one background,
          so the pairing is fixed: pick the file for the surface it sits on.{" "}
          <code>QuillLogo</code> chooses navy or white by colour scheme;{" "}
          <code>QuillName</code> is always the white wordmark, because the
          ribbon is always navy.
        </StoryNote>
        <Stack gap="md" mt="xl">
          <LogoSwatch
            src="/android-chrome-512x512.png"
            alt="Grey quill mark on a navy tile"
            height={6}
            inset={0}
            background={brand.primary}
            label="Mark on a navy tile"
            colours={`${brand.mark} on ${brand.primary}`}
            usage="the installed app's icon, and the email avatar (/email/quill-avatar.png, the same in a circle)"
          />
          <LogoSwatch
            src="/quill-logo.png"
            alt="Navy quill mark"
            height={4.5}
            background={brand.background}
            label="Navy mark"
            colours={`${brand.primary} on white`}
            usage='login, register and password pages in light mode (QuillLogo colour="default")'
          />
          <LogoSwatch
            src="/quill-logo-white.png"
            alt="White quill mark"
            height={4.5}
            background={brand.primary}
            label="White mark"
            colours="#ffffff on navy"
            usage='the same pages in dark mode (QuillLogo colour="white")'
          />
          <LogoSwatch
            src="/quill-logo-light-grey.png"
            alt="Light grey quill mark"
            height={4.5}
            background={brand.background}
            label="Light grey mark"
            colours="#939296 on white"
            usage='QuillLogo colour="light-grey"; no page uses it today'
          />
          <LogoSwatch
            src="/quill-name-white.png"
            alt="White Quill Medical wordmark"
            height={3}
            width={10}
            background={brand.primary}
            label="White wordmark"
            colours="#ffffff on navy"
            usage="the app's top ribbon (QuillName)"
          />
          <LogoSwatch
            src="/quill-name.png"
            alt="Navy Quill Medical wordmark"
            height={3}
            width={10}
            background={brand.background}
            label="Navy wordmark"
            colours={`${brand.primary} on white`}
            usage="the file exists; no page uses it today"
          />
          <LogoSwatch
            src="/quill-name-long-white-amber.png"
            alt="Quill Medical wordmark in white and amber"
            height={3}
            width={20}
            background={brand.primary}
            label="White and amber wordmark"
            colours={`#ffffff and ${brand.secondary} on navy`}
            usage="the public site's ribbon and footer, and the header band of every Quill email (/email/quill-wordmark.png, the same at email size)"
          />
        </Stack>
      </div>

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
