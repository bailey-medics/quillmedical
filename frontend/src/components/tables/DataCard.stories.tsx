/**
 * DataCard Storybook Stories
 *
 * Demonstrates the DataCard component with different data types
 * and column configurations.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Container } from "@mantine/core";
import { ActiveStatus } from "@/components/badge";
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
  tags: ["autodocs"],
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
          <ActiveStatus active={patient.status === "active"} />
        ),
      },
    ],
    onClick: fn(),
  },
};

/**
 * Single field
 *
 * A card with only one column — no dividers shown.
 */
export const SingleField: Story = {
  args: {
    row: { id: 1, username: "alice.smith", email: "alice@example.com" },
    columns: [{ header: "Username", render: (user) => user.username }],
    onClick: fn(),
  },
};
