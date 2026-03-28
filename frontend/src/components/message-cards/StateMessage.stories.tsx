/**
 * StateMessage Component Stories
 *
 * Demonstrates informational alert messages for different application states:
 * - Database initialising: Blue alert with clock icon when FHIR is loading
 * - No patients: Grey alert with user-off icon when list is empty
 * - Error: Red alert with alert-circle icon for error conditions
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import StateMessage from "./StateMessage";

const meta: Meta<typeof StateMessage> = {
  title: "MessageCards/StateMessage",
  component: StateMessage,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
};

export default meta;

type Story = StoryObj<typeof StateMessage>;

export const DatabaseInitialising: Story = {
  args: {
    type: "database-initialising",
  },
};

export const NoPatients: Story = {
  args: {
    type: "no-patients",
  },
};

export const Error: Story = {
  args: {
    type: "error",
    message: "Failed to load data from the server",
  },
};
