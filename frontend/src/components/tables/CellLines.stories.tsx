/**
 * CellLines Storybook Stories
 *
 * Shown in a table of delegates, where it is used: somebody at one, two
 * or three sites, each line holding a site and its clinical lead.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import DataTable, { type Column } from "./DataTable";
import CellLines from "./CellLines";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof CellLines> = {
  title: "Tables/Cell lines",
  component: CellLines,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof CellLines>;

interface Site {
  name: string;
  clinical_lead: string | null;
}

interface Delegate {
  id: number;
  name: string;
  sites: Site[];
}

// Long enough to wrap in a narrow column, which is what used to push
// every clinical lead below it beside the wrong site.
const NORTHFIELD: Site = {
  name: "Northfield General Hospital Outpatient and Day Surgery Centre",
  clinical_lead: "Dr Thomas Kowalski",
};
const RIVERSIDE: Site = {
  name: "Riverside Community Hospital",
  clinical_lead: "Dr Priya Hughes",
};
const DAY_UNIT: Site = { name: "St Anne's Day Unit", clinical_lead: null };

const delegates: Delegate[] = [
  { id: 1, name: "Aisha Rahman", sites: [NORTHFIELD] },
  { id: 2, name: "Ben Carter", sites: [NORTHFIELD, RIVERSIDE] },
  { id: 3, name: "Chloe Evans", sites: [NORTHFIELD, RIVERSIDE, DAY_UNIT] },
  { id: 4, name: "Daniel Osborne", sites: [] },
];

/** A site and its clinical lead, together on one line. */
function siteWithLead(site: Site): string {
  return site.clinical_lead
    ? `${site.name}, clinical lead ${site.clinical_lead}`
    : `${site.name}, no clinical lead recorded`;
}

const columns: Column<Delegate>[] = [
  { header: "Name", render: (d) => d.name },
  {
    header: "Site and clinical lead",
    render: (d) => <CellLines lines={d.sites.map(siteWithLead)} />,
  },
];

function DelegatesTable() {
  return (
    <Stack gap="sm">
      <DataTable data={delegates} columns={columns} getRowKey={(d) => d.id} />
      <StoryNote>
        One, two and three sites, then none. Each line holds a site and its
        clinical lead, so the first site's long name can wrap without moving any
        lead beside another site.
      </StoryNote>
    </Stack>
  );
}

/** Delegates at one, two and three sites, and at none. */
export const SitesAndLeads: Story = {
  render: () => <DelegatesTable />,
};

/** The component on its own: one line, three lines, and none. */
export const OnItsOwn: Story = {
  render: () => (
    <Stack gap="md">
      <CellLines lines={["Northfield General Hospital"]} />
      <StoryNote>One line</StoryNote>
      <CellLines
        lines={[
          "Northfield General Hospital",
          "Riverside Community Hospital",
          "St Anne's Day Unit",
        ]}
      />
      <StoryNote>Three lines</StoryNote>
      <CellLines lines={[]} />
      <StoryNote>None, shown as a dash</StoryNote>
    </Stack>
  ),
};

export const DarkMode: Story = {
  render: () => <DelegatesTable />,
  globals: { colorScheme: "dark" },
};
