/**
 * The brand's part of Foundations/Colours: its four colours, its two
 * colour scales and its logo, in that brand's own words.
 *
 * Storybook runs as one brand (`just sb quill` or `just sb ldd`), and
 * these sections read that brand from the theme around them, so the
 * Colours page shows the palette Storybook is running rather than Quill's
 * whatever the brand. Kept out of the story file so it can be tested.
 */

import { Box, Group, Stack, useMantineTheme } from "@mantine/core";
import type { ReactNode } from "react";
import { StoryNote } from "@/stories/variants";
import type { BrandColours } from "@/theme";
import PageHeader from "@components/page-header";
import Image from "@components/images/Image";
import publicAsset from "@lib/publicAsset";

/* ------------------------------------------------------------------ */
/*  Swatches                                                           */
/* ------------------------------------------------------------------ */

/** One named colour, with what it is for. */
export function ColourSwatch({
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

/**
 * One version of a brand's mark or wordmark, on the background it is
 * drawn for. `width` and `inset` are rem; the tile is 6rem tall.
 */
function LogoSwatch({
  artwork,
  width = 6,
  inset = 0.75,
  background,
  pageBackground,
  label,
  colours,
  usage,
}: {
  artwork: ReactNode;
  width?: number;
  inset?: number;
  background: string;
  pageBackground: string;
  label: string;
  colours: string;
  usage: string;
}) {
  const onPage = background === pageBackground;

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <Box
        style={{
          width: `${width}rem`,
          height: "6rem",
          borderRadius: 8,
          backgroundColor: background,
          border: onPage ? "1px solid var(--mantine-color-gray-3)" : undefined,
          padding: `${inset}rem`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {artwork}
      </Box>
      <div>
        <StoryNote mt={0}>{label.toUpperCase()}</StoryNote>
        <StoryNote mt={0}>
          {colours} - {usage}
        </StoryNote>
      </div>
    </Group>
  );
}

/** One 10-shade ramp, with the default shade marked. */
export function ScaleRow({
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

/* ------------------------------------------------------------------ */
/*  Each brand's words                                                 */
/* ------------------------------------------------------------------ */

/** One logo file, or the wordmark, as the logo section lists it. */
interface LogoEntry {
  artwork: ReactNode;
  width?: number;
  inset?: number;
  background: string;
  label: string;
  colours: string;
  usage: string;
}

/** What the Colours page says about one brand. */
interface BrandWords {
  /** What each brand colour is for, after its hex value */
  primary: string;
  secondary: string;
  background: string;
  mark: string;
  /** The scale names, such as "primary (navy)" */
  primaryScale: string;
  secondaryScale: string;
  /** The shade marked DEFAULT on the primary scale */
  primaryDefaultShade: number;
  logoTitle: string;
  logoNote: ReactNode;
  logos: (colours: BrandColours) => LogoEntry[];
}

/**
 * Every brand's words, keyed as `theme.other.brand` names it. A brand
 * added to shared/brand.yaml needs an entry here too, or the page throws.
 */
const BRAND_WORDS: Readonly<Record<string, BrandWords>> = {
  quill: {
    primary: "navigation, primary actions, brand identity",
    secondary: "secondary buttons, accents, highlights",
    background: "page backgrounds, card surfaces",
    mark: "the quill on a navy tile: the email avatar and the installed app's icon. Light grey, not white, so the mark sits back from the navy",
    primaryScale: "primary (navy)",
    secondaryScale: "secondary (amber)",
    primaryDefaultShade: 8,
    logoTitle: "Quill logo",
    logoNote: (
      <>
        The mark is the feather; the wordmark is the name. Each is a PNG in{" "}
        <code>frontend/public</code>, drawn in one colour for one background, so
        the pairing is fixed: pick the file for the surface it sits on.{" "}
        <code>QuillLogo</code> chooses navy or white by colour scheme;{" "}
        <code>QuillName</code> is always the white wordmark, because the ribbon
        is always navy.
      </>
    ),
    logos: (colours) => [
      {
        artwork: (
          <Image
            src={publicAsset("/android-chrome-512x512.png")}
            alt="Grey quill mark on a navy tile"
            height={6}
          />
        ),
        inset: 0,
        background: colours.primary,
        label: "Mark on a navy tile",
        colours: `${colours.mark} on ${colours.primary}`,
        usage:
          "the installed app's icon, and the email avatar (/email/quill-avatar.png, the same in a circle)",
      },
      {
        artwork: (
          <Image
            src={publicAsset("/quill-logo.png")}
            alt="Navy quill mark"
            height={4.5}
          />
        ),
        background: colours.background,
        label: "Navy mark",
        colours: `${colours.primary} on white`,
        usage:
          'login, register and password pages in light mode (QuillLogo colour="default")',
      },
      {
        artwork: (
          <Image
            src={publicAsset("/quill-logo-white.png")}
            alt="White quill mark"
            height={4.5}
          />
        ),
        background: colours.primary,
        label: "White mark",
        colours: "#ffffff on navy",
        usage: 'the same pages in dark mode (QuillLogo colour="white")',
      },
      {
        artwork: (
          <Image
            src={publicAsset("/quill-logo-light-grey.png")}
            alt="Light grey quill mark"
            height={4.5}
          />
        ),
        background: colours.background,
        label: "Light grey mark",
        colours: "#939296 on white",
        usage: 'QuillLogo colour="light-grey"; no page uses it today',
      },
      {
        artwork: (
          <Image
            src={publicAsset("/quill-name-white.png")}
            alt="White Quill Medical wordmark"
            height={3}
          />
        ),
        width: 10,
        background: colours.primary,
        label: "White wordmark",
        colours: "#ffffff on navy",
        usage: "the app's top ribbon (QuillName)",
      },
      {
        artwork: (
          <Image
            src={publicAsset("/quill-name.png")}
            alt="Navy Quill Medical wordmark"
            height={3}
          />
        ),
        width: 10,
        background: colours.background,
        label: "Navy wordmark",
        colours: `${colours.primary} on white`,
        usage: "the file exists; no page uses it today",
      },
      {
        artwork: (
          <Image
            src={publicAsset("/quill-name-long-white-amber.png")}
            alt="Quill Medical wordmark in white and amber"
            height={3}
          />
        ),
        width: 20,
        background: colours.primary,
        label: "White and amber wordmark",
        colours: `#ffffff and ${colours.secondary} on navy`,
        usage:
          "the public site's ribbon and footer, and the header band of every Quill email (/email/quill-wordmark.png, the same at email size)",
      },
    ],
  },
  ldd: {
    primary:
      "the logo's blue back head: the ribbon, filled buttons, links and body text",
    secondary:
      "a light grey from the logo's front head: accents, highlights and the current navigation link",
    background: "page backgrounds, card surfaces",
    mark: "the white tile the logo is drawn on",
    primaryScale: "primary (blue)",
    secondaryScale: "secondary (grey)",
    primaryDefaultShade: 5,
    logoTitle: "Let's Do Digital logo",
    logoNote: (
      <>
        One logo, <code>frontend/public/brands/ldd/logo.png</code>, a grey head
        drawn as a mesh in front of a blue one, for every surface. It sits on a
        white tile, because its back head is the brand blue and would be lost on
        the dark-mode page. The wordmark is the name in Geostar Fill, Let&apos;s
        Do Digital&apos;s own font, drawn as a white SVG,{" "}
        <code>wordmark-white.svg</code>, for the blue ribbon, and in the brand
        blue, <code>wordmark-dark.svg</code>, for a light background.
      </>
    ),
    logos: (colours) => [
      {
        artwork: (
          <Image
            src={publicAsset("/brands/ldd/logo.png")}
            alt="Let's Do Digital logo, a grey head in front of a blue one"
            height={6}
          />
        ),
        inset: 0,
        background: colours.mark,
        label: "Logo on a white tile",
        colours: `grey and ${colours.primary} on ${colours.mark}`,
        usage: "every QuillLogo under Let's Do Digital, in light and dark",
      },
      {
        artwork: (
          <Image
            src={publicAsset("/brands/ldd/wordmark-white.svg")}
            alt="White Let's Do Digital wordmark"
            height={2.1}
          />
        ),
        width: 20,
        background: colours.primary,
        label: "White wordmark",
        colours: `#ffffff on ${colours.primary}`,
        usage:
          "the app's top ribbon (QuillName), set in Geostar Fill with each letter drawn as a path, so no font loads",
      },
      {
        artwork: (
          <Image
            src={publicAsset("/brands/ldd/wordmark-dark.svg")}
            alt="Blue Let's Do Digital wordmark"
            height={2.1}
          />
        ),
        width: 20,
        background: colours.mark,
        label: "Dark wordmark",
        colours: `${colours.primary} on ${colours.mark}`,
        usage: 'a light background, as QuillName colour="dark"',
      },
    ],
  },
};

/** The words and colours for the brand of the theme around the caller. */
function useBrandFoundations(): { words: BrandWords; colours: BrandColours } {
  const { other } = useMantineTheme();
  const brand = other.brand ?? "quill";

  if (!Object.hasOwn(BRAND_WORDS, brand) || other.colours === undefined) {
    throw new Error(
      `Foundations/Colours has no words for the brand "${brand}". ` +
        "Add it to BRAND_WORDS in src/stories/BrandFoundations.tsx.",
    );
  }

  return { words: BRAND_WORDS[brand], colours: other.colours };
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

/** The brand's four colours, each with what it is for. */
export function BrandColourSwatches() {
  const { words, colours } = useBrandFoundations();

  return (
    <>
      <ColourSwatch
        colour={colours.primary}
        label="Primary"
        description={`${colours.primary} - ${words.primary}`}
      />
      <ColourSwatch
        colour={colours.secondary}
        label="Secondary"
        description={`${colours.secondary} - ${words.secondary}`}
      />
      <ColourSwatch
        colour={colours.background}
        label="Background"
        description={`${colours.background} - ${words.background}`}
      />
      <ColourSwatch
        colour={colours.mark}
        label="Mark"
        description={`${colours.mark} - ${words.mark}`}
      />
    </>
  );
}

/** The brand's primary and secondary ramps, as the theme holds them. */
export function BrandScales() {
  const { words } = useBrandFoundations();
  const theme = useMantineTheme();

  return (
    <>
      <ScaleRow
        name={words.primaryScale}
        scale={theme.colors.primary}
        primaryShade={words.primaryDefaultShade}
      />
      <ScaleRow
        name={words.secondaryScale}
        scale={theme.colors.secondary}
        primaryShade={5}
      />
    </>
  );
}

/** The brand's logo files and wordmark, each on its own surface. */
export function BrandLogos() {
  const { words, colours } = useBrandFoundations();

  return (
    <div>
      <PageHeader title={words.logoTitle} />
      <StoryNote>{words.logoNote}</StoryNote>
      <Stack gap="md" mt="xl">
        {words.logos(colours).map((entry) => (
          <LogoSwatch
            key={entry.label}
            artwork={entry.artwork}
            width={entry.width}
            inset={entry.inset}
            background={entry.background}
            pageBackground={colours.background}
            label={entry.label}
            colours={entry.colours}
            usage={entry.usage}
          />
        ))}
      </Stack>
    </div>
  );
}
