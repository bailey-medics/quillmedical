/**
 * StateMessage Component Stories
 *
 * Demonstrates informational alert messages for different patient list states:
 * - Database initialising: Blue alert with clock icon when FHIR is loading
 * - No patients: Gray alert with user-off icon when list is empty
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import StateMessage from "./StateMessage";

const meta: Meta<typeof StateMessage> = {
  title: "StateMessages/StateMessage",
  component: StateMessage,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
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
