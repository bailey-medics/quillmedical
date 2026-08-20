/**
 * UpdateFallbackBanner Component Stories
 *
 * Shown when the forced-reload flow's automatic reload didn't resolve
 * the mismatch — see ForcedReloadGate.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryNote } from "@/stories/variants";
import UpdateFallbackBanner from "./UpdateFallbackBanner";

const meta: Meta<typeof UpdateFallbackBanner> = {
  title: "Overlays/Update fallback banner",
  component: UpdateFallbackBanner,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof UpdateFallbackBanner>;

/** Default — shown after an automatic forced-reload attempt didn't resolve the mismatch */
export const Default: Story = {
  render: () => (
    <>
      <UpdateFallbackBanner onDismiss={() => {}} />
      <StoryNote>
        Dismissible, but background retries keep happening regardless of
        dismissal (see ForcedReloadGate) — this is purely a passive notice
        offering a manual refresh, never a reload loop.
      </StoryNote>
    </>
  ),
};

/** Dark mode */
export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
