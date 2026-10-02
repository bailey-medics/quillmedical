/**
 * DataTable Storybook Stories
 *
 * Demonstrates the DataTable component with different data types,
 * states, and column configurations.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { Container, Group } from "@mantine/core";
import { ActiveStatusBadge } from "@/components/badge";
import IconTextButton from "@/components/button/IconTextButton";
import { StoryNote } from "@/stories/variants";
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
  title: "Tables/Data table",
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

interface Admission {
  id: number;
  name: string;
  nhsNumber: string;
  ward: string;
  consultant: string;
  admitted: string;
  expectedDischarge: string;
  status: "active" | "inactive";
}

const admissions: Admission[] = [
  {
    id: 1,
    name: "Alice Smith",
    nhsNumber: "943 476 5919",
    ward: "Ward 12",
    consultant: "Dr Okafor",
    admitted: "2026-09-28",
    expectedDischarge: "2026-10-04",
    status: "active",
  },
  {
    id: 2,
    name: "Bob Jones",
    nhsNumber: "943 476 5920",
    ward: "Ward 7",
    consultant: "Dr Reilly",
    admitted: "2026-09-30",
    expectedDischarge: "2026-10-02",
    status: "inactive",
  },
  {
    id: 3,
    name: "Charlie Brown",
    nhsNumber: "943 476 5921",
    ward: "Ward 12",
    consultant: "Dr Diallo",
    admitted: "2026-10-01",
    expectedDischarge: "2026-10-06",
    status: "active",
  },
];

const sevenColumns: Column<Admission>[] = [
  { header: "Name", render: (a) => a.name, accessor: (a) => a.name },
  { header: "NHS number", render: (a) => a.nhsNumber },
  { header: "Ward", render: (a) => a.ward, accessor: (a) => a.ward },
  { header: "Consultant", render: (a) => a.consultant },
  {
    header: "Admitted",
    render: (a) => a.admitted,
    accessor: (a) => a.admitted,
  },
  { header: "Expected discharge", render: (a) => a.expectedDischarge },
  {
    header: "Status",
    render: (a) => <ActiveStatusBadge active={a.status === "active"} />,
  },
];

const threeColumns: Column<Admission>[] = sevenColumns.filter((c) =>
  ["Name", "Ward", "Status"].includes(c.header),
);

/**
 * Seven columns in a 40rem space. Seven columns need 56rem at the
 * default 8rem each, so the table draws cards. Widen the Storybook
 * canvas and nothing changes: the container, not the screen, is what is
 * measured.
 */
export const SevenColumnsInANarrowSpace: StoryObj<typeof DataTable<Admission>> =
  {
    render: () => (
      <div>
        <Container size={40 * 16} px={0}>
          <DataTable
            data={admissions}
            columns={sevenColumns}
            onRowClick={fn()}
            getRowKey={(a) => a.id}
          />
        </Container>
        <StoryNote mt="xs">
          Container constrained to 40rem: seven columns do not fit, so cards
        </StoryNote>
      </div>
    ),
  };

/**
 * Three columns in the same 40rem space. Three columns need 24rem, which
 * fits, so this stays a table where the one above became cards.
 */
export const ThreeColumnsInANarrowSpace: StoryObj<typeof DataTable<Admission>> =
  {
    render: () => (
      <div>
        <Container size={40 * 16} px={0}>
          <DataTable
            data={admissions}
            columns={threeColumns}
            onRowClick={fn()}
            getRowKey={(a) => a.id}
          />
        </Container>
        <StoryNote mt="xs">
          The same 40rem: three columns fit, so still a table
        </StoryNote>
      </div>
    ),
  };

/**
 * Seven columns at the full width of the page container. Drag the
 * Storybook canvas narrower than about 56rem and it switches to cards;
 * widen it past 58rem and it comes back, the 2rem margin stopping it
 * flickering at the edge.
 */
export const SevenColumnsAtFullWidth: StoryObj<typeof DataTable<Admission>> = {
  render: () => (
    <div>
      <DataTable
        data={admissions}
        columns={sevenColumns}
        onRowClick={fn()}
        getRowKey={(a) => a.id}
      />
      <StoryNote mt="xs">
        Shrink the canvas below about 56rem to see the switch to cards
      </StoryNote>
    </div>
  ),
};

function NarrowTableThatRemounts() {
  const [mountCount, setMountCount] = useState(0);
  return (
    <div>
      <Group justify="flex-end" mb="md">
        <IconTextButton
          icon="refresh"
          label="Remount the table"
          onClick={() => setMountCount((count) => count + 1)}
        />
      </Group>
      <Container size={40 * 16} px={0}>
        <DataTable
          key={mountCount}
          data={admissions}
          columns={sevenColumns}
          onRowClick={fn()}
          getRowKey={(a) => a.id}
        />
      </Container>
      <StoryNote mt="xs">
        Seven columns in 40rem, mounted afresh on each press. It must appear as
        cards at once, never as a table for a frame first.
      </StoryNote>
    </div>
  );
}

/**
 * Remount to check for a flash. The container is measured before the
 * first paint, so a table that is going to be cards is never drawn as a
 * table first. Press the button and watch the top of the table: there
 * should be no flicker. Before the fix there was one frame of table.
 */
export const RemountToCheckForAFlash: StoryObj<typeof DataTable<Admission>> = {
  render: () => <NarrowTableThatRemounts />,
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

export const DarkModeLoading: Story = {
  ...Loading,
  globals: { colorScheme: "dark" },
};
