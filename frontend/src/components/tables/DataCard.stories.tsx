/**
 * DataCard Storybook Stories
 *
 * Demonstrates the DataCard component with different data types
 * and column configurations.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Container } from "@mantine/core";
import { ActiveStatusBadge } from "@/components/badge";
import DataCard from "./DataCard";
import type { Column } from "./DataTable";

interface User {
  id: number;
  username: string;
  email: string;
}

interface Patient {
  id: string;
  name: string;
  birthDate: string;
  gender: string;
  status: "active" | "inactive";
}

const meta: Meta<typeof DataCard<User>> = {
  title: "Tables/DataCard",
  component: DataCard,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Container size="sm" ml={0}>
        <Story />
      </Container>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DataCard<User>>;

const userColumns: Column<User>[] = [
  { header: "Username", render: (user) => user.username },
  { header: "Email", render: (user) => user.email },
  { header: "User ID", render: (user) => String(user.id) },
];

/**
 * Default DataCard
 *
 * Shows a single card with user data.
 */
export const Default: Story = {
  args: {
    row: { id: 1, username: "alice.smith", email: "alice@example.com" },
    columns: userColumns,
    onClick: fn(),
  },
};

/**
 * With patient data
 *
 * Demonstrates the card with patient data including a status badge.
 */
export const WithPatientData: StoryObj<typeof DataCard<Patient>> = {
  args: {
    row: {
      id: "p-001",
      name: "John Doe",
      birthDate: "1985-03-15",
      gender: "Male",
      status: "active",
    },
    columns: [
      { header: "Name", render: (patient) => patient.name },
      { header: "Birth date", render: (patient) => patient.birthDate },
      { header: "Gender", render: (patient) => patient.gender },
      { header: "Patient ID", render: (patient) => patient.id },
      {
        header: "Status",
        render: (patient) => (
          <ActiveStatusBadge active={patient.status === "active"} />
        ),
      },
    ],
    onClick: fn(),
  },
};

/**
 * Long text
 *
 * Shows how the card handles very long content in a cell.
 */
export const LongText: Story = {
  args: {
    row: {
      id: 1,
      username: "alice.smith",
      email:
        "alice.very-long-email-address-that-goes-on-and-on-and-on-and-keeps-going@extremely-long-domain-name-example.co.uk",
    },
    columns: [
      { header: "Username", render: (user) => user.username },
      { header: "Email", render: (user) => user.email },
      {
        header: "Notes",
        render: () =>
          "This is a very long piece of text that might appear in a cell. It keeps going and going to test how the card layout handles overflow and wrapping behaviour when the content is much longer than expected.",
      },
      {
        header: "Reference",
        render: () =>
          "Pneumonoultramicroscopicsilicovolcanoconiosis-with-additional-hyphenated-words-that-make-it-even-longer",
      },
    ],
    onClick: fn(),
  },
};

/**
 * Loading
 *
 * Shows skeleton placeholders while data is being fetched.
 */
export const Loading: Story = {
  args: {
    row: { id: 0, username: "", email: "" },
    columns: userColumns,
    onClick: fn(),
    loading: true,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
