/**
 * NewMessageModal Component Stories
 *
 * Demonstrates the new message modal:
 * - Default state with patient selector
 * - Pre-filled patient (locked selector)
 * - Patient user view
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { FormSubmitResult } from "@/components/form/Form";
import NewMessageModal from "./NewMessageModal";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const mockSubmit = async (): Promise<FormSubmitResult> => {
  await delay(1000);
  return {
    state: "success",
    message: { title: "Conversation started" },
  };
};

const meta: Meta<typeof NewMessageModal> = {
  title: "Messaging/NewMessageModal",
  component: NewMessageModal,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    onClose: () => {},
    onSubmit: mockSubmit,
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

/** Patient user view — patient field and toggle hidden */
export const PatientView: Story = {
  args: {
    isPatientView: true,
    patientId: "p-1",
    patientName: "James Green",
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
