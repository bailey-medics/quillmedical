/**
 * AppraisalPeriodForm Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import AppraisalPeriodForm from "./AppraisalPeriodForm";

const meta: Meta<typeof AppraisalPeriodForm> = {
  title: "Passport/Appraisal period form",
  component: AppraisalPeriodForm,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof AppraisalPeriodForm>;

export const Default: Story = {
  args: { onSubmit: fn(), onCancel: fn() },
};

/** Correcting a range: filled in from it, saving rather than adding. */
export const Editing: Story = {
  args: {
    initial: { starts_on: "2025-10-01", ends_on: "2026-09-30" },
    onSubmit: fn(),
    onCancel: fn(),
  },
};

/** Refused before sending: the button stays disabled. */
export const EndsBeforeItStarts: Story = {
  args: {
    initial: { starts_on: "2026-10-01", ends_on: "2026-09-30" },
    onSubmit: fn(),
    onCancel: fn(),
  },
};

/** Refused by the server, which alone sees the other ranges. */
export const OverlapRefused: Story = {
  args: {
    initial: { starts_on: "2026-06-01", ends_on: "2027-05-31" },
    error:
      "The date range starting 2026-06-01 overlaps the one starting 2025-10-01. Each CPD activity can only count towards one range.",
    onSubmit: fn(),
    onCancel: fn(),
  },
};

export const Submitting: Story = {
  args: {
    initial: { starts_on: "2025-10-01", ends_on: "2026-09-30" },
    isSubmitting: true,
    onSubmit: fn(),
    onCancel: fn(),
  },
};
