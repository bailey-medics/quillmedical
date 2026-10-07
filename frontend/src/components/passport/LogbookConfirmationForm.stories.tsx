/**
 * LogbookConfirmationForm Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import LogbookConfirmationForm from "./LogbookConfirmationForm";
import { logbookConfirmation } from "./fixtures";

const meta: Meta<typeof LogbookConfirmationForm> = {
  title: "Passport/Logbook confirmation form",
  component: LogbookConfirmationForm,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof LogbookConfirmationForm>;

/** What a supervisor sees when asked to confirm one logbook entry. */
export const Default: Story = {
  args: {
    confirmation: logbookConfirmation,
    onConfirm: fn(),
    onDecline: fn(),
  },
};

export const Submitting: Story = {
  args: {
    confirmation: logbookConfirmation,
    onConfirm: fn(),
    onDecline: fn(),
    isSubmitting: true,
  },
};
