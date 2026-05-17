/**
 * Centres Story
 *
 * Full-page composition showing the centres view for a teaching
 * module. Displays a table of centres that offer module teaching,
 * with an add button to register new centres.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group, Stack } from "@mantine/core";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import TeachingMainNav from "@/components/navigation/teaching/TeachingMainNav";
import PageHeader from "@/components/typography/PageHeader";
import DataTable, { type Column } from "@/components/tables/DataTable";
import AddButton from "@/components/button/AddButton";

// ── Stub data ───────────────────────────────────────────────────────

interface Centre {
  id: number;
  name: string;
  clinicalLead: string;
  clinicalLeadEmail: string;
  delegateCount: number;
}

const CENTRES: Centre[] = [
  {
    id: 1,
    name: "Leeds General Infirmary Endoscopy Unit",
    clinicalLead: "Prof James Morton",
    clinicalLeadEmail: "j.morton@nhs.net",
    delegateCount: 24,
  },
  {
    id: 2,
    name: "St James's University Hospital Endoscopy Suite",
    clinicalLead: "Dr Rachel Singh",
    clinicalLeadEmail: "r.singh@nhs.net",
    delegateCount: 18,
  },
  {
    id: 3,
    name: "Bradford Royal Infirmary Endoscopy Centre",
    clinicalLead: "Dr Fiona Clarke",
    clinicalLeadEmail: "f.clarke@nhs.net",
    delegateCount: 12,
  },
  {
    id: 4,
    name: "Airedale General Hospital Endoscopy Unit",
    clinicalLead: "Dr Tom Henderson",
    clinicalLeadEmail: "t.henderson@nhs.net",
    delegateCount: 6,
  },
  {
    id: 5,
    name: "Harrogate District Hospital Endoscopy Suite",
    clinicalLead: "Dr Anika Patel",
    clinicalLeadEmail: "a.patel@nhs.net",
    delegateCount: 9,
  },
];

// ── Columns ─────────────────────────────────────────────────────────

const columns: Column<Centre>[] = [
  { header: "Centre", render: (c) => c.name },
  { header: "Clinical lead", render: (c) => c.clinicalLead },
  { header: "Clinical lead email", render: (c) => c.clinicalLeadEmail },
  { header: "Number of delegates", render: (c) => c.delegateCount },
];

// ── Interactive wrapper ─────────────────────────────────────────────

function CentresPage() {
  return (
    <TeachingLayout
      sidebar={<TeachingMainNav />}
      footerText="Logged in: prof.morton"
    >
      <Stack gap="lg">
        <PageHeader title="Centres" />

        <Group justify="flex-end">
          <AddButton label="Add centre" />
        </Group>

        <DataTable
          data={CENTRES}
          columns={columns}
          getRowKey={(c) => c.id}
          emptyMessage="No centres have been added yet"
        />
      </Stack>
    </TeachingLayout>
  );
}

// ── Stories ──────────────────────────────────────────────────────────

const meta: Meta = {
  title: "Teaching/Layouts/Centres",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  tags: ["!test"],
  render: () => <CentresPage />,
};

export const Empty: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingLayout
      sidebar={<TeachingMainNav />}
      footerText="Logged in: prof.morton"
    >
      <Stack gap="lg">
        <PageHeader title="Centres" />

        <Group justify="flex-end">
          <AddButton label="Add centre" />
        </Group>

        <DataTable
          data={[]}
          columns={columns}
          getRowKey={(c: Centre) => c.id}
          emptyMessage="No centres have been added yet"
        />
      </Stack>
    </TeachingLayout>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
