/**
 * StatusStrip Component Stories
 *
 * Demonstrates the consolidated status strip in each of its states,
 * rendered inside the real app layout (TopRibbon + SideNav) for context
 * — matching the intended production placement (directly below
 * TopRibbon, in normal layout flow, no fixed positioning).
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { demoPatientsList } from "@/demo-data/patients/demoPatients";
import { StoryNote } from "@/stories/variants";
import MainLayout from "@/components/layouts/MainLayout";
import StatusStrip from "./StatusStrip";

const RESIZE_NOTE =
  "Only visible when more than one strip is showing at once: resize the browser narrower than the sm breakpoint (640px) to see these render as compact horizontal badges instead of full-width strips.";

const meta: Meta<typeof StatusStrip> = {
  title: "Overlays/Status strip",
  component: StatusStrip,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof StatusStrip>;

/** Offline — connectivity lost, shows the last successful sync time */
export const Offline: Story = {
  args: {
    variant: "offline",
    lastSyncedAt: new Date(),
  },
  render: (args) => (
    <MainLayout patient={demoPatientsList[0]}>
      <StatusStrip {...args} />
      <StoryNote>
        A lone strip always stays full-width, even on mobile — only switches to
        a badge when stacked alongside another strip.
      </StoryNote>
    </MainLayout>
  ),
};

/** Reconnected — brief confirmation after connectivity returns */
export const Reconnected: Story = {
  args: {
    variant: "reconnected",
  },
  render: (args) => (
    <MainLayout patient={demoPatientsList[0]}>
      <StatusStrip {...args} />
    </MainLayout>
  ),
};

/** Updating — a contract-step forced reload is imminent */
export const Updating: Story = {
  args: {
    variant: "updating",
  },
  render: (args) => (
    <MainLayout patient={demoPatientsList[0]}>
      <StatusStrip {...args} />
    </MainLayout>
  ),
};

/** Fallback — the automatic forced reload didn't resolve the mismatch; keeps retrying in the background */
export const Fallback: Story = {
  args: {
    variant: "fallback",
  },
  render: (args) => (
    <MainLayout patient={demoPatientsList[0]}>
      <StatusStrip {...args} />
    </MainLayout>
  ),
};

/**
 * Two strips stacked — e.g. offline while a forced reload is also
 * pending. Each condition renders its own StatusStrip; they stack
 * vertically in mount order, with no priority given to either.
 */
export const TwoStripsStacked: Story = {
  render: () => (
    <MainLayout patient={demoPatientsList[0]}>
      <StatusStrip variant="offline" lastSyncedAt={new Date()} multiple />
      <StatusStrip variant="updating" multiple />
      <StoryNote>{RESIZE_NOTE}</StoryNote>
    </MainLayout>
  ),
};

/**
 * Three strips stacked — offline, an update that didn't apply
 * automatically, and (briefly) the updating notice. Demonstrates that
 * concurrent status conditions never overlap or compete for a single
 * slot — every condition gets its own strip.
 */
export const ThreeStripsStacked: Story = {
  render: () => (
    <MainLayout patient={demoPatientsList[0]}>
      <StatusStrip variant="offline" lastSyncedAt={new Date()} multiple />
      <StatusStrip variant="updating" multiple />
      <StatusStrip variant="fallback" multiple />
      <StoryNote>{RESIZE_NOTE}</StoryNote>
    </MainLayout>
  ),
};

/** Dark mode */
export const DarkMode: Story = {
  ...Offline,
  globals: { colorScheme: "dark" },
};
