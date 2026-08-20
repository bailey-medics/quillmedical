/**
 * UpdatingBanner Component Stories
 *
 * Demonstrates the forced-reload notice, rendered inside the real app
 * layout (TopRibbon + SideNav) for context — matching the intended
 * production placement, same as OfflineStrip.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { demoPatientsList } from "@/demo-data/patients/demoPatients";
import { StoryNote } from "@/stories/variants";
import MainLayout from "@/components/layouts/MainLayout";
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

/** Default — shown for a few seconds before a forced, contract-step reload */
export const Default: Story = {
  render: () => (
    <MainLayout patient={demoPatientsList[0]}>
      <UpdatingBanner />
      <StoryNote>
        Mounted only for the forced/contract-step reload path (a staged breaking
        API change completing) — routine and expand-step reloads stay fully
        silent and never render this. Non-dismissible; the reload-trigger code
        controls the whole show-then-reload lifecycle.
      </StoryNote>
    </MainLayout>
  ),
};

/** Blocking full-screen overlay — used by ForcedReloadGate for the API-compatibility forced-reload flow */
export const Blocking: Story = {
  render: () => (
    <>
      <UpdatingBanner blocking />
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
  ...Default,
  globals: { colorScheme: "dark" },
};
