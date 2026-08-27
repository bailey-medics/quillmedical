/**
 * UpdatingBanner Component Stories
 *
 * Demonstrates the full-screen blocking overlay used by the
 * API-compatibility forced-reload flow.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryNote } from "@/stories/variants";
import UpdatingBanner from "./UpdatingBanner";

const meta: Meta<typeof UpdatingBanner> = {
  title: "Overlays/Updating banner",
  component: UpdatingBanner,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof UpdatingBanner>;

/** Blocking full-screen overlay — used by ForcedReloadGate for the API-compatibility forced-reload flow */
export const Blocking: Story = {
  render: () => (
    <>
      <UpdatingBanner />
      <StoryNote>
        Full-screen, non-dismissible overlay used when a tab is running a bundle
        older than the API now requires (the C &lt; S case) — not route-gated,
        mutating requests are stopped until the reload completes.
      </StoryNote>
    </>
  ),
};

/** Dark mode */
export const DarkMode: Story = {
  ...Blocking,
  globals: { colorScheme: "dark" },
};
