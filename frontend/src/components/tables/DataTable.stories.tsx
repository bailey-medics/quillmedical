/**
 * DataTable Storybook Stories
 *
 * Demonstrates the DataTable component with different data types,
 * states, and column configurations.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Container } from "@mantine/core";
import { ActiveStatusBadge } from "@/components/badge";
import DataTable, { type Column } from "./DataTable";

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

const meta: Meta<typeof DataTable<User>> = {
  title: "Tables/DataTable",
  component: DataTable,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Container size="lg">
        <Story />
      </Container>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DataTable<User>>;

const sampleUsers: User[] = [
  { id: 1, username: "alice.smith", email: "alice@example.com" },
  { id: 2, username: "bob.jones", email: "bob@example.com" },
  { id: 3, username: "charlie.brown", email: "charlie@example.com" },
  { id: 4, username: "diana.prince", email: "diana@example.com" },
];

const userColumns: Column<User>[] = [
  {
    header: "Username",
    render: (user) => user.username,
  },
  {
    header: "Email",
    render: (user) => user.email,
  },
  {
    header: "User ID",
    render: (user) => String(user.id),
  },
];

/**
 * Default DataTable
 *
 * Shows the table with user data and basic columns.
 */
export const Default: Story = {
  args: {
    data: sampleUsers,
    columns: userColumns,
    onRowClick: fn(),
    getRowKey: (user) => user.id,
  },
};

/**
 * With Patient Data
 *
 * Demonstrates the table with patient data including a status badge column.
 */
export const WithPatientData: StoryObj<typeof DataTable<Patient>> = {
  args: {
    data: [
      {
        id: "p-001",
        name: "John Doe",
        birthDate: "1985-03-15",
        gender: "Male",
        status: "active",
      },
      {
        id: "p-002",
        name: "Jane Smith",
        birthDate: "1992-07-22",
        gender: "Female",
        status: "active",
      },
      {
        id: "p-003",
        name: "Robert Johnson",
        birthDate: "1978-11-30",
        gender: "Male",
        status: "inactive",
      },
    ],
    columns: [
      {
        header: "Name",
        render: (patient) => patient.name,
      },
      {
        header: "Birth date",
        render: (patient) => patient.birthDate,
      },
      {
        header: "Gender",
        render: (patient) => patient.gender,
      },
      {
        header: "Patient ID",
        render: (patient) => patient.id,
      },
      {
        header: "Status",
        render: (patient) => (
          <ActiveStatusBadge active={patient.status === "active"} />
        ),
      },
    ],
    onRowClick: fn(),
    getRowKey: (patient) => patient.id,
  },
};

/**
 * Many Rows
 *
 * Shows the table with more data to demonstrate scrolling behavior.
 */
export const ManyRows: Story = {
  args: {
    data: Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      username: `user${i + 1}`,
      email: `user${i + 1}@example.com`,
    })),
    columns: userColumns,
    onRowClick: fn(),
    getRowKey: (user) => user.id,
  },
};

/**
 * Long Text
 *
 * Tests how the table handles cells with very long text content.
 */
// cspell:disable
export const LongText: Story = {
  args: {
    data: [
      {
        id: 1,
        username: "superlongusernamethatjustkeepsgoingandgoingwithoutanybreaks",
        email:
          "a.very.long.email.address.that.goes.on.and.on@extremely-long-domain-name-example.co.uk",
      },
      {
        id: 2,
        username: "normaluser",
        email: "normal@example.com",
      },
      {
        id: 3,
        username: "Dr. Bartholomew Featherstonehaugh-Worthington III",
        email:
          "bartholomew.featherstonehaugh-worthington@prestigious-medical-institution.nhs.uk",
      },
    ],
    columns: userColumns,
    onRowClick: fn(),
    getRowKey: (user) => user.id,
  },
};
// cspell:enable

/**
 * Empty State
 *
 * Shows a message when there is no data to display.
 */
export const Empty: Story = {
  args: {
    data: [],
    columns: userColumns,
    onRowClick: fn(),
    getRowKey: (user) => user.id,
    emptyMessage: "No users found",
  },
};

/**
 * Error State
 *
 * Shows an error alert when data fails to load.
 */
export const Error: Story = {
  args: {
    data: [],
    columns: userColumns,
    onRowClick: fn(),
    getRowKey: (user) => user.id,
    error: "Failed to load users from the server",
  },
};

/**
 * Loading State
 *
 * Shows skeleton loaders while data is being fetched.
 */
export const Loading: Story = {
  args: {
    data: [],
    columns: userColumns,
    onRowClick: fn(),
    getRowKey: (user) => user.id,
    loading: true,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
