/**
 * StateMessage Component Stories
 *
 * Demonstrates informational alert messages for different application states.
 * All content is passed via props — icon, title, description, and colour.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import StateMessage from "./StateMessage";
import {
  IconAlertCircle,
  IconCalendar,
  IconClock,
  IconFileText,
  IconMail,
  IconMessage,
  IconPencil,
  IconShieldCheck,
  IconUserOff,
} from "@/components/icons/appIcons";

const meta: Meta<typeof StateMessage> = {
  title: "MessageCards/StateMessage",
  component: StateMessage,
  parameters: {
    layout: "padded",
  },
};

export default meta;

type Story = StoryObj<typeof StateMessage>;

export const DatabaseInitialising: Story = {
  args: {
    icon: <IconClock />,
    title: "Database is initialising",
    description:
      "The Quill databases are just warming up. This may take a few moments. The patient list will appear automatically once available.",
    colour: "info",
  },
};

export const NoPatients: Story = {
  args: {
    icon: <IconUserOff />,
    title: "No patients to show",
    description: "There are currently no patients in the system.",
    colour: "warning",
  },
};

export const NoLetters: Story = {
  args: {
    icon: <IconMail />,
    title: "No letters to show",
    description: "There are no clinical letters for this patient yet.",
    colour: "warning",
  },
};

export const NoMessages: Story = {
  args: {
    icon: <IconMessage />,
    title: "No messages to show",
    description: "Messages from your care team will appear here.",
    colour: "warning",
  },
};

export const NoNotes: Story = {
  args: {
    icon: <IconPencil />,
    title: "No notes to show",
    description: "There are no clinical notes for this patient yet.",
    colour: "warning",
  },
};

export const NoDocuments: Story = {
  args: {
    icon: <IconFileText />,
    title: "No documents to show",
    description: "There are no documents for this patient yet.",
    colour: "warning",
  },
};

export const NoAppointments: Story = {
  args: {
    icon: <IconCalendar />,
    title: "No appointments to show",
    description: "There are no appointments scheduled for this patient.",
    colour: "warning",
  },
};

export const Error: Story = {
  args: {
    icon: <IconAlertCircle />,
    title: "Error loading data",
    description: "Failed to load data from the server",
    colour: "alert",
  },
};

export const CustomColour: Story = {
  args: {
    icon: <IconShieldCheck />,
    title: "Access restricted",
    description: "You do not have permission to view this content.",
    colour: "neutral",
  },
};

export const DarkMode: Story = {
  ...DatabaseInitialising,
  globals: { colorScheme: "dark" },
};
