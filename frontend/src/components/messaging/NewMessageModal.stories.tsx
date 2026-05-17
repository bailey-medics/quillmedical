/**
 * NewMessageModal Component Stories
 *
 * Demonstrates the new message modal:
 * - Default state with patient selector
 * - Pre-filled patient (locked selector)
 * - Patient user view
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
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
  title: "Messaging/New message modal",
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

/** Error state — submits and shows inline error via FormStatusNarrow */
export const WithError: Story = {
  args: {
    isPatientView: true,
    patientId: "p-1",
    patientName: "James Green",
    onSubmit: async () => {
      await delay(500);
      return {
        state: "error",
        message: { title: "Failed to create conversation. Please try again." },
      } satisfies FormSubmitResult;
    },
  },
  play: async () => {
    // Modal renders in a portal, so query from document.body
    const body = within(document.body);
    // Click into Participants and type to show we tried
    const participantsInput = body.getByPlaceholderText(
      "Add staff to this conversation",
    );
    await userEvent.type(participantsInput, "Dr");
    // Close the dropdown by pressing Escape
    await userEvent.keyboard("{Escape}");
    await userEvent.type(
      body.getByLabelText("Subject *"),
      "Prescription renewal",
    );
    await userEvent.type(
      body.getByLabelText("Message *"),
      "Hello, I need to renew my prescription.",
    );
    await userEvent.click(body.getByTestId("submit-button"));
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
