/**
 * NewMessageModal Component Stories
 *
 * Demonstrates the new message modal:
 * - Default state with patient selector
 * - Pre-filled patient (locked selector)
 * - Submitting state
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "@storybook/test";
import NewMessageModal from "./NewMessageModal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalFetch = (globalThis as any).fetch;

const mockFetch = async (url: string, init?: RequestInit) => {
  if (typeof url === "string" && url.includes("/patients")) {
    return new Response(
      JSON.stringify({
        patients: [
          { id: "p-1", name: "James Green" },
          { id: "p-2", name: "Sarah Johnson" },
          { id: "p-3", name: "William Miller" },
          { id: "p-4", name: "Emily Davis" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  if (typeof url === "string" && url.includes("/users")) {
    return new Response(
      JSON.stringify({
        users: [
          { id: 1, username: "mark.bailey" },
          { id: 2, username: "john.smith" },
          { id: 3, username: "emily.williams" },
          { id: 4, username: "gemma.corbett" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  return originalFetch(url, init);
};

// Install mock immediately so it's available when component effects run
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockFetch;

const meta: Meta<typeof NewMessageModal> = {
  title: "Messaging/NewMessageModal",
  component: NewMessageModal,
  tags: ["autodocs"],
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
  play: async () => {
    // Query document.body — Mantine Modal renders in a portal outside canvasElement.
    // Use findByLabelText with a generous timeout to handle slow CI environments
    // where the story may still be loading when the play function starts.
    const body = within(document.body);
    const subject = await body.findByLabelText(
      "Subject",
      {},
      { timeout: 15000 },
    );
    const message = await body.findByLabelText(
      "Message",
      {},
      { timeout: 15000 },
    );
    await userEvent.type(subject, "Prescription renewal");
    await userEvent.type(message, "Hello, I'd like to renew my prescription.");
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
