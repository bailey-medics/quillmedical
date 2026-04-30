/**
 * Foundations/Palettes Story
 *
 * Candidate colour palettes for the app UI. Each palette derives
 * lighter, calmer working colours from the brand navy (#001a36)
 * and gold (#C8963E) — suitable for a clinical app used 8+ hours daily.
 *
 * Compare side by side and pick the combination that feels right.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";

const meta: Meta = {
  title: "Foundations/Palettes",
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/*  Palette definitions                                                */
/* ------------------------------------------------------------------ */

type Palette = {
  name: string;
  description: string;
  nav: string;
  navText: string;
  primary: string;
  primaryHover: string;
  accent: string;
  accentHover: string;
  surface: string;
  surfaceBorder: string;
  cardBg: string;
};

const palettes: Palette[] = [
  {
    name: "A — Current (light blue bar)",
    description:
      "The current app bar colour (#e6f7ff) with Mantine default blue actions. Familiar baseline for comparison.",
    nav: "#e6f7ff",
    navText: "#1c7ed6",
    primary: "#228be6",
    primaryHover: "#1c7ed6",
    accent: "#c8963e",
    accentHover: "#b8862e",
    surface: "#f8f9fa",
    surfaceBorder: "#dee2e6",
    cardBg: "#ffffff",
  },
  {
    name: "B — Light blue bar + navy accent",
    description:
      "Keep the familiar light bar but use brand navy for primary buttons. Gold for secondary. Ties brand identity to actions rather than chrome.",
    nav: "#e6f7ff",
    navText: "#001a36",
    primary: "#001a36",
    primaryHover: "#1e3a5f",
    accent: "#c8963e",
    accentHover: "#b8862e",
    surface: "#f8f9fa",
    surfaceBorder: "#dee2e6",
    cardBg: "#ffffff",
  },
  {
    name: "C — Classic navy bar",
    description:
      "Full brand navy nav bar, medium blue for actions, warm muted gold for accents. Traditional and authoritative.",
    nav: "#001a36",
    navText: "#ffffff",
    primary: "#1c7ed6",
    primaryHover: "#1971c2",
    accent: "#b8943e",
    accentHover: "#a6842e",
    surface: "#f8f9fa",
    surfaceBorder: "#dee2e6",
    cardBg: "#ffffff",
  },
  {
    name: "D — Soft navy bar",
    description:
      "Lighter navy nav so the whole UI feels less heavy. Mantine blue for actions, desaturated gold for accents. Calmer overall.",
    nav: "#1e3a5f",
    navText: "#ffffff",
    primary: "#228be6",
    primaryHover: "#1c7ed6",
    accent: "#c4a054",
    accentHover: "#b89044",
    surface: "#f8f9fa",
    surfaceBorder: "#dee2e6",
    cardBg: "#ffffff",
  },
  {
    name: "E — Steel blue-grey bar",
    description:
      "Blue-grey nav for a modern, desaturated feel. Slightly cooler actions, subtle warm accent. Minimal and clinical.",
    nav: "#2b3e50",
    navText: "#ffffff",
    primary: "#3b82c4",
    primaryHover: "#3074b0",
    accent: "#c9a050",
    accentHover: "#b89040",
    surface: "#f5f7f9",
    surfaceBorder: "#dce1e6",
    cardBg: "#ffffff",
  },
  {
    name: "F — White bar + navy brand",
    description:
      "Clean white nav bar with navy text and a coloured bottom border. Bright and airy — lets content breathe. Common in modern SaaS.",
    nav: "#ffffff",
    navText: "#001a36",
    primary: "#1c7ed6",
    primaryHover: "#1971c2",
    accent: "#c8963e",
    accentHover: "#b8862e",
    surface: "#f8f9fa",
    surfaceBorder: "#dee2e6",
    cardBg: "#ffffff",
  },
  {
    name: "G — Teal clinical",
    description:
      "Teal-accented blue — common in healthcare apps (NHS, Epic). Feels approachable and fresh. Gold accent warms the cooler primary.",
    nav: "#001a36",
    navText: "#ffffff",
    primary: "#0c8599",
    primaryHover: "#0b7285",
    accent: "#c8963e",
    accentHover: "#b8862e",
    surface: "#f8f9fa",
    surfaceBorder: "#dee2e6",
    cardBg: "#ffffff",
  },
  {
    name: "H — Light teal bar",
    description:
      "Soft teal-tinted bar matching the healthcare feel but keeping the UI light and open. Teal primary buttons, warm gold secondary.",
    nav: "#e6fcf5",
    navText: "#0b7285",
    primary: "#0c8599",
    primaryHover: "#0b7285",
    accent: "#c8963e",
    accentHover: "#b8862e",
    surface: "#f8f9fa",
    surfaceBorder: "#dee2e6",
    cardBg: "#ffffff",
  },
  {
    name: "I — Indigo modern",
    description:
      "Slightly purple-blue for a modern, approachable feel. Full brand navy nav anchors the identity. Warm gold accent for contrast.",
    nav: "#001a36",
    navText: "#ffffff",
    primary: "#4c6ef5",
    primaryHover: "#4263eb",
    accent: "#d4a853",
    accentHover: "#c49843",
    surface: "#f8f9fa",
    surfaceBorder: "#dee2e6",
    cardBg: "#ffffff",
  },
  {
    name: "J — Warm grey bar",
    description:
      "Neutral warm grey nav — no colour commitment in chrome, all colour in actions. Navy primary buttons carry the brand. Very safe and versatile.",
    nav: "#f1f0ee",
    navText: "#001a36",
    primary: "#001a36",
    primaryHover: "#1e3a5f",
    accent: "#c8963e",
    accentHover: "#b8862e",
    surface: "#f8f9fa",
    surfaceBorder: "#dee2e6",
    cardBg: "#ffffff",
  },
];

/* ------------------------------------------------------------------ */
/*  Mock UI components                                                 */
/* ------------------------------------------------------------------ */

function NavBar({ palette }: { palette: Palette }) {
  const isLight =
    palette.nav === "#ffffff" ||
    palette.nav === "#f8f9fa" ||
    palette.nav === "#f1f0ee" ||
    palette.nav.startsWith("#e");

  return (
    <Box
      style={{
        backgroundColor: palette.nav,
        padding: "12px 20px",
        borderRadius: "8px 8px 0 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: isLight
          ? `2px solid ${palette.primary}`
          : "2px solid transparent",
      }}
    >
      <Text fw={700} c={palette.navText} size="md">
        Quill Medical
      </Text>
      <Group gap="md">
        <Text size="sm" c={palette.navText} style={{ opacity: 0.6 }}>
          Patients
        </Text>
        <Text size="sm" c={palette.navText} style={{ opacity: 0.6 }}>
          Messages
        </Text>
        <Text size="sm" c={palette.navText} fw={600}>
          Dashboard
        </Text>
      </Group>
    </Box>
  );
}

function MockCard({ palette }: { palette: Palette }) {
  return (
    <Paper
      shadow="sm"
      radius="md"
      p="lg"
      withBorder
      style={{
        backgroundColor: palette.cardBg,
        borderColor: palette.surfaceBorder,
      }}
    >
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <div>
            <Text fw={600} size="md">
              Patient record
            </Text>
            <Text size="sm" c="dimmed">
              Last updated 2 hours ago
            </Text>
          </div>
          <Box
            style={{
              backgroundColor: palette.accent,
              color: "white",
              padding: "4px 12px",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Active
          </Box>
        </Group>

        <Group gap="sm">
          <Button
            size="sm"
            style={{
              backgroundColor: palette.primary,
              "&:hover": { backgroundColor: palette.primaryHover },
            }}
          >
            View details
          </Button>
          <Button
            size="sm"
            variant="outline"
            style={{
              color: palette.primary,
              borderColor: palette.primary,
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            style={{
              backgroundColor: palette.accent,
              "&:hover": { backgroundColor: palette.accentHover },
            }}
          >
            Secondary action
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function ColourChips({ palette }: { palette: Palette }) {
  const chips = [
    { label: "Nav", colour: palette.nav },
    { label: "Primary", colour: palette.primary },
    { label: "Primary hover", colour: palette.primaryHover },
    { label: "Accent", colour: palette.accent },
    { label: "Accent hover", colour: palette.accentHover },
    { label: "Surface", colour: palette.surface },
  ];

  return (
    <Group gap="xs" wrap="wrap">
      {chips.map((chip) => (
        <Group key={chip.label} gap={6} align="center">
          <Box
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              backgroundColor: chip.colour,
              border: "1px solid var(--mantine-color-gray-3)",
              flexShrink: 0,
            }}
          />
          <Text size="xs" c="dimmed">
            {chip.label}: {chip.colour}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

function PalettePreview({ palette }: { palette: Palette }) {
  return (
    <Stack gap="md">
      <div>
        <Title order={3} mb={4}>
          {palette.name}
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          {palette.description}
        </Text>
      </div>

      <Box
        style={{
          backgroundColor: palette.surface,
          borderRadius: 8,
          border: `1px solid ${palette.surfaceBorder}`,
          overflow: "hidden",
        }}
      >
        <NavBar palette={palette} />
        <Box p="lg">
          <MockCard palette={palette} />
        </Box>
      </Box>

      <ColourChips palette={palette} />
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/*  Stories                                                            */
/* ------------------------------------------------------------------ */

/** All candidate palettes side by side. */
export const Comparison: Story = {
  render: () => (
    <Stack gap="xl">
      <div>
        <Title order={1} mb={4}>
          App palette candidates
        </Title>
        <Text size="sm" c="dimmed" mb="xl">
          Each palette derives lighter working colours from the brand navy
          (#001a36) and gold (#C8963E). The brand colours remain for the public
          site and logo — these are the app&apos;s day-to-day UI colours.
        </Text>
      </div>

      {palettes.map((palette) => (
        <PalettePreview key={palette.name} palette={palette} />
      ))}
    </Stack>
  ),
};

/** Palette A — current light blue bar. */
export const PaletteA: Story = {
  render: () => <PalettePreview palette={palettes[0]} />,
};

/** Palette B — light blue bar + navy brand buttons. */
export const PaletteB: Story = {
  render: () => <PalettePreview palette={palettes[1]} />,
};

/** Palette C — classic dark navy bar. */
export const PaletteC: Story = {
  render: () => <PalettePreview palette={palettes[2]} />,
};

/** Palette D — soft navy bar, calmer overall. */
export const PaletteD: Story = {
  render: () => <PalettePreview palette={palettes[3]} />,
};

/** Palette E — steel blue-grey, modern and clinical. */
export const PaletteE: Story = {
  render: () => <PalettePreview palette={palettes[4]} />,
};

/** Palette F — white bar with coloured bottom border. */
export const PaletteF: Story = {
  render: () => <PalettePreview palette={palettes[5]} />,
};

/** Palette G — teal clinical, fresh and approachable. */
export const PaletteG: Story = {
  render: () => <PalettePreview palette={palettes[6]} />,
};

/** Palette H — light teal bar, healthcare feel. */
export const PaletteH: Story = {
  render: () => <PalettePreview palette={palettes[7]} />,
};

/** Palette I — indigo modern with warm gold accent. */
export const PaletteI: Story = {
  render: () => <PalettePreview palette={palettes[8]} />,
};

/** Palette J — warm grey bar, navy brand buttons. */
export const PaletteJ: Story = {
  render: () => <PalettePreview palette={palettes[9]} />,
};
