/**
 * AdminTable Storybook Stories
 *
 * Demonstrates the AdminTable component with different data types,
 * states, and column configurations.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
import { Container, Text, Badge } from "@mantine/core";
import AdminTable, { type Column } from "./AdminTable";

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

const meta: Meta<typeof AdminTable<User>> = {
  title: "Tables/AdminTable",
  component: AdminTable,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <Container size="lg">
        <Story />
      </Container>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AdminTable<User>>;

const sampleUsers: User[] = [
  { id: 1, username: "alice.smith", email: "alice@example.com" },
  { id: 2, username: "bob.jones", email: "bob@example.com" },
  { id: 3, username: "charlie.brown", email: "charlie@example.com" },
  { id: 4, username: "diana.prince", email: "diana@example.com" },
];

const userColumns: Column<User>[] = [
  {
    header: "Username",
    render: (user) => <Text fw={500}>{user.username}</Text>,
  },
  {
    header: "Email",
    render: (user) => user.email,
  },
  {
    header: "User ID",
    render: (user) => (
      <Text size="lg" c="dimmed">
        {user.id}
      </Text>
    ),
  },
];

/**
 * Default AdminTable
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
export const WithPatientData: StoryObj<typeof AdminTable<Patient>> = {
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
        render: (patient) => <Text fw={500}>{patient.name}</Text>,
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
        render: (patient) => (
          <Text size="lg" c="dimmed">
            {patient.id}
          </Text>
        ),
      },
      {
        header: "Status",
        render: (patient) => (
          <Badge
            color={patient.status === "active" ? "green" : "red"}
            variant="light"
            size="sm"
          >
            {patient.status === "active" ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    onRowClick: fn(),
    getRowKey: (patient) => patient.id,
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
 * Custom Column Alignment
 *
 * Demonstrates custom text alignment for different columns.
 */
export const CustomAlignment: Story = {
  args: {
    data: sampleUsers,
    columns: [
      {
        header: "Username",
        render: (user) => <Text fw={500}>{user.username}</Text>,
        align: "left",
      },
      {
        header: "Email",
        render: (user) => user.email,
        align: "center",
      },
      {
        header: "User ID",
        render: (user) => (
          <Text size="lg" c="dimmed">
            {user.id}
          </Text>
        ),
        align: "right",
      },
    ],
    onRowClick: fn(),
    getRowKey: (user) => user.id,
  },
};

/**
 * Single Row
 *
 * Shows the table with just one data row.
 */
export const SingleRow: Story = {
  args: {
    data: [sampleUsers[0]],
    columns: userColumns,
    onRowClick: fn(),
    getRowKey: (user) => user.id,
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
 * Custom Breakpoint
 *
 * Demonstrates using a custom breakpoint for wider tables.
 * Set to "md" (900px) instead of default "sm" (768px) to maintain
 * table layout longer before switching to cards on smaller screens.
 */
export const CustomBreakpoint: Story = {
  args: {
    data: sampleUsers,
    columns: userColumns,
    onRowClick: fn(),
    getRowKey: (user) => user.id,
    breakpoint: "md",
  },
};
