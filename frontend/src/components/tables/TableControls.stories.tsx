/**
 * Table Controls Stories
 *
 * Demonstrates FilterSelect, sorting, search, and pagination working together.
 * Filtering reduces the dataset, which automatically updates the
 * pagination page count. Search from the ribbon filters across all columns.
 */

import { useState, useMemo, useCallback } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container, Group, Stack } from "@mantine/core";
import FilterSelect from "@components/form/FilterSelect";
import TopRibbon from "@components/ribbon/TopRibbon";
import { SearchProvider, useSearch } from "@lib/search";
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
  { header: "Name", render: (d) => d.name, accessor: (d) => d.name },
  { header: "Trust", render: (d) => d.trust, accessor: (d) => d.trust },
  {
    header: "Clinical lead",
    render: (d) => d.lead,
    accessor: (d) => d.lead,
  },
  { header: "Status", render: (d) => d.status, accessor: (d) => d.status },
];

function FilteredPaginatedTable() {
  const [filters, setFilters] = useState<string[]>([]);
  const { query } = useSearch();

  const filteredData = useMemo(() => {
    let result = delegates;

    // Apply category filters
    if (filters.length > 0) {
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

      result = result.filter((d) => {
        const matchesTrust =
          trustFilters.length === 0 || trustFilters.includes(d.trust);
        const matchesLead =
          leadFilters.length === 0 || leadFilters.includes(d.lead);
        return matchesTrust && matchesLead;
      });
    }

    // Apply search query
    if (query.trim()) {
      const lower = query.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(lower) ||
          d.trust.toLowerCase().includes(lower) ||
          d.lead.toLowerCase().includes(lower) ||
          d.status.toLowerCase().includes(lower),
      );
    }

    return result;
  }, [filters, query]);

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

/** Wraps table with TopRibbon and SearchProvider to demonstrate full search flow */
function WithRibbonSearch() {
  const noop = useCallback(() => {}, []);
  return (
    <SearchProvider>
      <TopRibbon
        onBurgerClick={noop}
        patient={null}
        isLoading={false}
        showSearch
      />
      <Container size="lg" py="md">
        <FilteredPaginatedTable />
      </Container>
    </SearchProvider>
  );
}

const meta: Meta = {
  title: "Tables/Table controls",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

export const FullControls: Story = {
  render: () => <WithRibbonSearch />,
};

export const DarkMode: Story = {
  render: () => <WithRibbonSearch />,
  globals: { colorScheme: "dark" },
};
