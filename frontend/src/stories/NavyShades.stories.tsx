/**
 * Foundations/Navy Shades Story
 *
 * Displays a range of shades derived from the brand navy (#001a36),
 * from the original dark through progressively lighter tints.
 * Useful for choosing app-appropriate derivatives of the brand colour.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Group, Stack, Text, Title } from "@mantine/core";

const meta: Meta = {
  title: "Foundations/Navy Shades",
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/*  Shade definitions                                                  */
/* ------------------------------------------------------------------ */

type Shade = {
  label: string;
  hex: string;
  usage: string;
};

const shades: Shade[] = [
  {
    label: "900 — Brand navy",
    hex: "#001a36",
    usage: "Logo, public site hero, darkest anchor",
  },
  {
    label: "800",
    hex: "#0a2744",
    usage: "Dark nav bar, footer backgrounds",
  },
  {
    label: "700",
    hex: "#143452",
    usage: "Dark nav bar (softer), sidebar backgrounds",
  },
  {
    label: "600",
    hex: "#1e3a5f",
    usage: "Soft navy nav bar, dark button hover",
  },
  {
    label: "500",
    hex: "#2b4f7a",
    usage: "Primary buttons on light backgrounds",
  },
  {
    label: "400",
    hex: "#3d6694",
    usage: "Active states, links, focused elements",
  },
  {
    label: "300",
    hex: "#5a84b0",
    usage: "Secondary interactive elements, icons",
  },
  {
    label: "200",
    hex: "#89a8c9",
    usage: "Borders, dividers, subtle accents",
  },
  {
    label: "100",
    hex: "#b4c8de",
    usage: "Light badges, tag backgrounds, hover tints",
  },
  {
    label: "50",
    hex: "#dce6f0",
    usage: "Surface tint, selected row backgrounds",
  },
  {
    label: "25",
    hex: "#edf2f7",
    usage: "Subtle surface, alternating table rows",
  },
  {
    label: "10",
    hex: "#f5f8fb",
    usage: "Lightest wash, page background tint",
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function ShadeSwatch({ shade }: { shade: Shade }) {
  const lightPrefixes = ["#8", "#9", "#a", "#b", "#c", "#d", "#e", "#f"];
  const isLight = lightPrefixes.some((p) =>
    shade.hex.toLowerCase().startsWith(p),
  );

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <Box
        style={{
          width: 80,
          height: 48,
          borderRadius: 8,
          backgroundColor: shade.hex,
          border: "1px solid var(--mantine-color-gray-3)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text size="xs" fw={600} c={isLight ? "#001a36" : "#ffffff"}>
          Aa
        </Text>
      </Box>
      <div style={{ minWidth: 0 }}>
        <Group gap="xs" align="baseline">
          <Text size="sm" fw={700}>
            {shade.label}
          </Text>
          <Text size="xs" c="dimmed" ff="monospace">
            {shade.hex}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          {shade.usage}
        </Text>
      </div>
    </Group>
  );
}

function GradientBar() {
  return (
    <Box
      style={{
        height: 40,
        borderRadius: 8,
        background: `linear-gradient(to right, ${shades.map((s) => s.hex).join(", ")})`,
        border: "1px solid var(--mantine-color-gray-3)",
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Stories                                                            */
/* ------------------------------------------------------------------ */

/** Full navy shade scale from brand dark to lightest wash. */
export const AllShades: Story = {
  render: () => (
    <Stack gap="xl">
      <div>
        <Title order={1} mb={4}>
          Navy shade scale
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Shades derived from the brand navy (#001a36). Darker shades suit
          chrome and emphasis; lighter shades suit surfaces, borders, and tints.
        </Text>
        <GradientBar />
      </div>

      <Stack gap="sm">
        {shades.map((shade) => (
          <ShadeSwatch key={shade.hex} shade={shade} />
        ))}
      </Stack>
    </Stack>
  ),
};

/** Dark shades (900-600) for nav bars, buttons, emphasis. */
export const DarkShades: Story = {
  render: () => (
    <Stack gap="xl">
      <Title order={2}>Dark shades (900-600)</Title>
      <Text size="sm" c="dimmed">
        Suitable for nav bars, primary buttons, footers, and emphasis elements.
      </Text>
      <Stack gap="sm">
        {shades.slice(0, 4).map((shade) => (
          <ShadeSwatch key={shade.hex} shade={shade} />
        ))}
      </Stack>
    </Stack>
  ),
};

/** Mid shades (500-200) for interactive elements, borders. */
export const MidShades: Story = {
  render: () => (
    <Stack gap="xl">
      <Title order={2}>Mid shades (500-200)</Title>
      <Text size="sm" c="dimmed">
        Suitable for buttons, links, active states, icons, and borders.
      </Text>
      <Stack gap="sm">
        {shades.slice(4, 8).map((shade) => (
          <ShadeSwatch key={shade.hex} shade={shade} />
        ))}
      </Stack>
    </Stack>
  ),
};

/** Light shades (100-10) for surfaces, tints, subtle backgrounds. */
export const LightShades: Story = {
  render: () => (
    <Stack gap="xl">
      <Title order={2}>Light shades (100-10)</Title>
      <Text size="sm" c="dimmed">
        Suitable for badge backgrounds, surface tints, hover states, and table
        row alternation.
      </Text>
      <Stack gap="sm">
        {shades.slice(8).map((shade) => (
          <ShadeSwatch key={shade.hex} shade={shade} />
        ))}
      </Stack>
    </Stack>
  ),
};
