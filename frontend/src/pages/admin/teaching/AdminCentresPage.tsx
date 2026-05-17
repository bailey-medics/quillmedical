/**
 * Admin Centres Page
 *
 * Displays centres signed up to govern learning and teaching
 * for each module. Stub data pending backend implementation.
 */

import { Container, Group, Stack } from "@mantine/core";
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

const columns: Column<Centre>[] = [
  { header: "Centre", render: (c) => c.name },
  { header: "Clinical lead", render: (c) => c.clinicalLead },
  { header: "Clinical lead email", render: (c) => c.clinicalLeadEmail },
  { header: "Number of delegates", render: (c) => c.delegateCount },
];

export default function AdminCentresPage() {
  return (
    <Container size="lg" py="xl">
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
    </Container>
  );
}
