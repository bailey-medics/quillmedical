/**
 * Foundations/Gold Shades Story
 *
 * Displays a range of shades derived from the brand gold (#C8963E),
 * from the original saturated tone through progressively lighter tints.
 * Useful for choosing app-appropriate derivatives of the secondary colour.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Group, Stack, Text, Title } from "@mantine/core";

const meta: Meta = {
  title: "Foundations/Gold Shades",
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
    label: "600 — Brand gold",
    hex: "#C8963E",
    usage: "Brand colour, public site accent, secondary buttons",
  },
  {
    label: "500",
    hex: "#d4a854",
    usage: "Secondary buttons in app, highlighted elements",
  },
  {
    label: "400",
    hex: "#ddb86e",
    usage: "Active states, warm interactive accents",
  },
  {
    label: "300",
    hex: "#e5c88a",
    usage: "Icons, subtle warm accents, borders",
  },
  {
    label: "200",
    hex: "#edd8a8",
    usage: "Tag backgrounds, warm dividers",
  },
  {
    label: "100",
    hex: "#f4e6c4",
    usage: "Light badges, warm surface tints",
  },
  {
    label: "50",
    hex: "#f9f0dc",
    usage: "Selected row backgrounds, warm hover tints",
  },
  {
    label: "25",
    hex: "#fcf6eb",
    usage: "Subtle warm surface, alternating table rows",
  },
  {
    label: "10",
    hex: "#fefbf5",
    usage: "Lightest wash, warm page background tint",
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
        <Text size="xs" fw={600} c={isLight ? "#7a5a1e" : "#ffffff"}>
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

/** Full gold shade scale from deep to lightest wash. */
export const AllShades: Story = {
  render: () => (
    <Stack gap="xl">
      <div>
        <Title order={1} mb={4}>
          Gold shade scale
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Shades derived from the brand gold (#C8963E), going lighter only. Mid
          tones suit buttons and accents; lighter shades suit surfaces, borders,
          and warm tints.
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

/** Mid shades (600-300) for buttons, accents, interactive elements. */
export const MidShades: Story = {
  render: () => (
    <Stack gap="xl">
      <Title order={2}>Mid shades (600-300)</Title>
      <Text size="sm" c="dimmed">
        Suitable for secondary buttons, active states, icons, and warm accents.
        The 600 shade is the brand gold itself.
      </Text>
      <Stack gap="sm">
        {shades.slice(0, 4).map((shade) => (
          <ShadeSwatch key={shade.hex} shade={shade} />
        ))}
      </Stack>
    </Stack>
  ),
};

/** Light shades (200-10) for surfaces, tints, subtle backgrounds. */
export const LightShades: Story = {
  render: () => (
    <Stack gap="xl">
      <Title order={2}>Light shades (200-10)</Title>
      <Text size="sm" c="dimmed">
        Suitable for tag backgrounds, surface tints, warm hover states, and
        alternating table rows.
      </Text>
      <Stack gap="sm">
        {shades.slice(4).map((shade) => (
          <ShadeSwatch key={shade.hex} shade={shade} />
        ))}
      </Stack>
    </Stack>
  ),
};
