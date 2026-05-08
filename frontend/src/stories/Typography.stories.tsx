/**
 * Foundations/Typography Overview
 *
 * Design system reference for Quill Medical's typography.
 * Documents font family, type scale, and component usage guidelines.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group, Stack } from "@mantine/core";
import BodyText from "@components/typography/BodyText";
import Divider from "@/components/divider/Divider";
import PageHeader from "@components/typography/PageHeader";
import { StoryNote } from "@/stories/variants";

const meta: Meta = {
  title: "Foundations/Typography",
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/*  Overview                                                           */
/* ------------------------------------------------------------------ */

export const Overview: Story = {
  render: () => (
    <Stack gap="xl">
      {/* Font family */}
      <Stack gap="xs">
        <PageHeader title="Font family" />
        <StoryNote>
          <strong>Atkinson Hyperlegible Next</strong> — designed by the Braille
          Institute for maximum readability. Self-hosted variable font (100–900
          weight range).
        </StoryNote>
        <StoryNote>
          Chosen for clinical accessibility: distinct Il1O0 characters, high
          x-height, open apertures, reduced eye strain over extended shifts.
        </StoryNote>
      </Stack>

      <Divider />

      {/* Character differentiation */}
      <Stack gap="xs">
        <PageHeader title="Character differentiation" />
        <StoryNote>
          Critical for clinical safety — confusing characters in dosages or IDs
          could cause harm.
        </StoryNote>
        <Group gap="xl" mt="xs">
          <Stack gap={2}>
            <BodyText>Il1O0 Qq9g rn m</BodyText>
          </Stack>
        </Group>
      </Stack>
    </Stack>
  ),
};
