/**
 * NewMessageModal Component Stories
 *
 * Demonstrates the new message modal:
 * - Default state with patient selector
 * - Pre-filled patient (locked selector)
 * - Submitting state
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import NewMessageModal from "./NewMessageModal";

const meta: Meta<typeof NewMessageModal> = {
  title: "Messaging/NewMessageModal",
  component: NewMessageModal,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    onClose: fn(),
    onSubmit: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof NewMessageModal>;

/** Default modal with patient selector visible */
export const Default: Story = {};

/** Patient pre-selected — shows patient name, selector hidden */
export const WithLockedPatient: Story = {
  args: {
    patientId: "p-1",
    patientName: "James Green",
  },
};

/** Submitting state — buttons disabled, "Creating…" label */
export const Submitting: Story = {
  args: {
    isSubmitting: true,
    patientId: "p-1",
    patientName: "James Green",
  },
};

/** Patient user view — patient field and toggle hidden */
export const PatientView: Story = {
  args: {
    isPatientView: true,
    patientId: "p-1",
    patientName: "James Green",
  },
};
