/**
 * ErrorState Component Stories
 *
 * What a user is shown when something has failed, in both sizes.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import ErrorState from "./ErrorState";

const meta: Meta<typeof ErrorState> = {
  title: "Error state/Error state",
  component: ErrorState,
  parameters: {
    layout: "padded",
  },
};

export default meta;

type Story = StoryObj<typeof ErrorState>;

export const Inline: Story = {
  args: {
    message: "Could not load the patient list.",
  },
};

export const InlineWithAction: Story = {
  args: {
    message: "Could not load the patient list.",
    action: { label: "Try again", onClick: () => {} },
  },
};

export const InlineWithCode: Story = {
  args: {
    message: "Could not load the demographics.",
    code: "demographics_fetch_failed",
    action: { label: "Try again", onClick: () => {} },
  },
};

export const CustomTitle: Story = {
  args: {
    title: "This letter could not be saved",
    message: "Your text has not been lost. Try saving again in a moment.",
    action: { label: "Try again", onClick: () => {} },
  },
};

export const Page: Story = {
  args: {
    variant: "page",
    message: "An unexpected error occurred. Please try reloading the page.",
    action: { label: "Reload page", onClick: () => {} },
  },
};

export const DarkMode: Story = {
  ...InlineWithCode,
  globals: { colorScheme: "dark" },
};
