/**
 * Table Controls Stories
 *
 * Demonstrates FilterSelect and pagination working together.
 * Filtering reduces the dataset, which automatically updates the
 * pagination page count.
 */

import { useState, useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container, Group, Stack } from "@mantine/core";
import FilterSelect from "@components/form/FilterSelect";
import DataTable, { type Column } from "./DataTable";

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
  { header: "Name", render: (d) => d.name },
  { header: "Trust", render: (d) => d.trust },
  { header: "Clinical lead", render: (d) => d.lead },
  { header: "Status", render: (d) => d.status },
];

function FilteredPaginatedTable() {
  const [filters, setFilters] = useState<string[]>([]);

  const filteredData = useMemo(() => {
    if (filters.length === 0) return delegates;

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

    return delegates.filter((d) => {
      const matchesTrust =
        trustFilters.length === 0 || trustFilters.includes(d.trust);
      const matchesLead =
        leadFilters.length === 0 || leadFilters.includes(d.lead);
      return matchesTrust && matchesLead;
    });
  }, [filters]);

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <FilterSelect
          data={filterData}
          value={filters}
          onChange={setFilters}
          label="Filter delegates"
          aria-label="Filter delegates"
        />
      </Group>
      <DataTable
        data={filteredData}
        columns={columns}
        getRowKey={(d) => d.id}
        pageSize={10}
      />
    </Stack>
  );
}

const meta: Meta = {
  title: "Tables/Table controls",
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Container size="lg">
        <Story />
      </Container>
    ),
  ],
};

export default meta;
type Story = StoryObj;

export const FilterAndPagination: Story = {
  render: () => <FilteredPaginatedTable />,
};

export const DarkMode: Story = {
  render: () => <FilteredPaginatedTable />,
  globals: { colorScheme: "dark" },
};
