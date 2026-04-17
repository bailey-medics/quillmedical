/**
 * StateMessage Component Stories
 *
 * Demonstrates informational alert messages for different application states:
 * - Database initialising: Blue alert with clock icon when FHIR is loading
 * - Empty list states: Grey alerts with contextual icons
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

export const NoLetters: Story = {
  args: {
    type: "no-letters",
  },
};

export const NoMessages: Story = {
  args: {
    type: "no-messages",
  },
};

export const NoNotes: Story = {
  args: {
    type: "no-notes",
  },
};

export const NoDocuments: Story = {
  args: {
    type: "no-documents",
  },
};

export const NoAppointments: Story = {
  args: {
    type: "no-appointments",
  },
};

export const Error: Story = {
  args: {
    type: "error",
    message: "Failed to load data from the server",
  },
};
