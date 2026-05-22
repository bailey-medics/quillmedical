/**
 * Table Controls Stories
 *
 * Demonstrates DataTableControlled with integrated search, filter,
 * sorting, and pagination working together.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container } from "@mantine/core";
import type { Column } from "./DataTable";
import DataTableControlled from "./DataTableControlled";

interface Delegate {
  id: number;
  name: string;
  trust: string;
  lead: string;
  status: "active" | "inactive";
}

const delegates: Delegate[] = Array.from({ length: 45 }, (_, i) => {
  const trusts = [
    "Leeds Teaching Hospitals",
    "Bradford Teaching Hospitals",
    "Airedale NHS Foundation Trust",
  ];
  const leads = ["Prof James Morton", "Dr Rachel Singh"];
  return {
    id: i + 1,
    name: `Delegate ${i + 1}`,
    trust: trusts[i % trusts.length],
    lead: leads[i % leads.length],
    status: i % 5 === 0 ? "inactive" : "active",
  };
});

const filterData = [
  {
    group: "Trust",
    items: [
      { value: "trust:leeds", label: "Leeds Teaching Hospitals" },
      { value: "trust:bradford", label: "Bradford Teaching Hospitals" },
      { value: "trust:airedale", label: "Airedale NHS Foundation Trust" },
    ],
  },
  {
    group: "Clinical lead",
    items: [
      { value: "lead:morton", label: "Prof James Morton" },
      { value: "lead:singh", label: "Dr Rachel Singh" },
    ],
  },
];

const columns: Column<Delegate>[] = [
  { header: "Name", render: (d) => d.name, accessor: (d) => d.name },
  { header: "Trust", render: (d) => d.trust, accessor: (d) => d.trust },
  {
    header: "Clinical lead",
    render: (d) => d.lead,
    accessor: (d) => d.lead,
  },
  { header: "Status", render: (d) => d.status, accessor: (d) => d.status },
];

function filterPredicate(filters: string[]) {
  const trustFilters = filters
    .filter((f) => f.startsWith("trust:"))
    .map((f) => {
      const map: Record<string, string> = {
        "trust:leeds": "Leeds Teaching Hospitals",
        "trust:bradford": "Bradford Teaching Hospitals",
        "trust:airedale": "Airedale NHS Foundation Trust",
      };
      return map[f];
    });

  const leadFilters = filters
    .filter((f) => f.startsWith("lead:"))
    .map((f) => {
      const map: Record<string, string> = {
        "lead:morton": "Prof James Morton",
        "lead:singh": "Dr Rachel Singh",
      };
      return map[f];
    });

  return (d: Delegate) => {
    const matchesTrust =
      trustFilters.length === 0 || trustFilters.includes(d.trust);
    const matchesLead =
      leadFilters.length === 0 || leadFilters.includes(d.lead);
    return matchesTrust && matchesLead;
  };
}

const meta: Meta = {
  title: "Tables/Table controls",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

export const FullControls: Story = {
  render: () => (
    <Container size="lg" py="md">
      <DataTableControlled
        data={delegates}
        columns={columns}
        getRowKey={(d) => d.id}
        pageSize={10}
        filterData={filterData}
        filterLabel="Filter delegates"
        filterAriaLabel="Filter delegates"
        searchFields={(d) => [d.name, d.trust, d.lead, d.status]}
        filterPredicate={filterPredicate}
      />
    </Container>
  ),
};

export const DarkMode: Story = {
  render: () => (
    <Container size="lg" py="md">
      <DataTableControlled
        data={delegates}
        columns={columns}
        getRowKey={(d) => d.id}
        pageSize={10}
        filterData={filterData}
        filterLabel="Filter delegates"
        filterAriaLabel="Filter delegates"
        searchFields={(d) => [d.name, d.trust, d.lead, d.status]}
        filterPredicate={filterPredicate}
      />
    </Container>
  ),
  globals: { colorScheme: "dark" },
};
