/**
 * AppraisalPeriodTable Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import AppraisalPeriodTable from "./AppraisalPeriodTable";
import { appraisalPeriods } from "./fixtures";

const meta: Meta<typeof AppraisalPeriodTable> = {
  title: "Passport/Appraisal period table",
  component: AppraisalPeriodTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof AppraisalPeriodTable>;

export const Default: Story = {
  args: { periods: appraisalPeriods, onEdit: fn(), onRemove: fn() },
};

/** A read-only passport: the ranges, with nothing to press. */
export const ReadOnly: Story = {
  args: { periods: appraisalPeriods, onEdit: undefined, onRemove: undefined },
};

export const Empty: Story = {
  args: { periods: [], onEdit: fn(), onRemove: fn() },
};

export const Loading: Story = {
  args: { periods: [], isLoading: true, onEdit: fn(), onRemove: fn() },
};
