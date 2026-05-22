/**
 * AdminAllDelegatesPage
 *
 * Admin view showing all delegates across teaching modules.
 * Displays stat cards, a filter popover, and a data table of
 * delegates with learning and assessment status.
 *
 * Only shows delegates belonging to the current user's organisation(s).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Group, Skeleton, SimpleGrid, Stack } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import StatCard from "@/components/stats-card/StatCard";
import DataTable, { type Column } from "@/components/tables/DataTable";
import FilterSelect from "@/components/form/FilterSelect";
import { useSearch, useSearchFilter } from "@lib/search";
import AssessmentResultBadge from "@/components/badge/AssessmentResultBadge";
import FormattedDate from "@/components/data/Date";
import { StateMessage } from "@/components/message-cards";
import { IconAlertCircle } from "@/components/icons/appIcons";
import { api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────

interface Delegate {
  id: number;
  name: string;
  email: string | null;
  site_name: string | null;
  clinical_lead: string | null;
  learning_completed: boolean | null;
  assessment_result: "pass" | "fail" | "incomplete" | null;
  assessment_date: string | null;
  first_time_pass: boolean;
}

// ── Columns ─────────────────────────────────────────────────────────

const columns: Column<Delegate>[] = [
  { header: "Name", render: (d) => d.name, accessor: (d) => d.name },
  {
    header: "Site",
    render: (d) => d.site_name ?? "—",
    accessor: (d) => d.site_name ?? "",
  },
  {
    header: "Clinical lead",
    render: (d) => d.clinical_lead ?? "—",
    accessor: (d) => d.clinical_lead ?? "",
  },
  {
    header: "Learning",
    render: (d) => {
      if (d.learning_completed === null) return "—";
      return d.learning_completed ? "Complete" : "In progress";
    },
    accessor: (d) =>
      d.learning_completed === null ? "" : d.learning_completed ? "1" : "0",
  },
  {
    header: "Assessment",
    render: (d) => {
      if (!d.assessment_result) return "—";
      return <AssessmentResultBadge result={d.assessment_result} />;
    },
    accessor: (d) => d.assessment_result ?? "",
  },
  {
    header: "Date",
    render: (d) => {
      if (!d.assessment_date) return "—";
      return <FormattedDate date={d.assessment_date} />;
    },
    accessor: (d) => d.assessment_date ?? "",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

function calcFirstPassRate(delegates: Delegate[]): number {
  const withResult = delegates.filter((d) => d.assessment_result === "pass");
  if (withResult.length === 0) return 0;
  const firstTimers = withResult.filter((d) => d.first_time_pass);
  return Math.round((firstTimers.length / withResult.length) * 100);
}

// ── Page ─────────────────────────────────────────────────────────────

export default function AdminAllDelegatesPage() {
  const { setShowSearch } = useSearch();
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<string[]>([]);

  useEffect(() => {
    setShowSearch(true);
    return () => setShowSearch(false);
  }, [setShowSearch]);

  useEffect(() => {
    let cancelled = false;
    async function fetchDelegates() {
      try {
        const data = await api.get<Delegate[]>("/teaching/admin/delegates");
        if (!cancelled) {
          setDelegates(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load delegates",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchDelegates();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build filter options from loaded data
  const filterOptions = useMemo(() => {
    const sites = [
      ...new Set(delegates.map((d) => d.site_name).filter(Boolean) as string[]),
    ];
    const leads = [
      ...new Set(
        delegates.map((d) => d.clinical_lead).filter(Boolean) as string[],
      ),
    ];
    return [
      ...(sites.length > 0
        ? [
            {
              group: "Site",
              items: sites.map((s) => ({ value: `site:${s}`, label: s })),
            },
          ]
        : []),
      ...(leads.length > 0
        ? [
            {
              group: "Clinical lead",
              items: leads.map((l) => ({ value: `lead:${l}`, label: l })),
            },
          ]
        : []),
      {
        group: "Other",
        items: [{ value: "first-pass-only", label: "1st time passers only" }],
      },
    ];
  }, [delegates]);

  const getSearchText = useCallback(
    (d: Delegate) => `${d.name} ${d.email ?? ""} ${d.site_name ?? ""}`,
    [],
  );
  const searched = useSearchFilter(delegates, getSearchText);

  const siteFilters = filters
    .filter((f) => f.startsWith("site:"))
    .map((f) => f.slice(5));
  const leadFilters = filters
    .filter((f) => f.startsWith("lead:"))
    .map((f) => f.slice(5));
  const firstPassOnly = filters.includes("first-pass-only");

  let filtered = searched;
  if (siteFilters.length > 0) {
    filtered = filtered.filter(
      (d) => d.site_name && siteFilters.includes(d.site_name),
    );
  }
  if (leadFilters.length > 0) {
    filtered = filtered.filter(
      (d) => d.clinical_lead && leadFilters.includes(d.clinical_lead),
    );
  }
  if (firstPassOnly) {
    filtered = filtered.filter((d) => d.first_time_pass);
  }

  if (loading) {
    return (
      <Stack gap="md">
        <Skeleton height={36} width={300} />
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </SimpleGrid>
        <Skeleton height={300} />
      </Stack>
    );
  }

  if (error) {
    return (
      <StateMessage
        icon={<IconAlertCircle />}
        title="Error loading delegates"
        description={error}
        colour="alert"
      />
    );
  }

  const firstPassRate = calcFirstPassRate(filtered);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <PageHeader title="All delegates" />
        <FilterSelect
          data={filterOptions}
          value={filters}
          onChange={setFilters}
          label="Filter delegates"
          aria-label="Filter delegates"
        />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <StatCard title="Total delegates" value={filtered.length} />
        <StatCard
          title="Passed"
          value={filtered.filter((d) => d.assessment_result === "pass").length}
        />
        <StatCard title="1st pass rate" value={firstPassRate} suffix="%" />
      </SimpleGrid>

      <DataTable
        data={filtered}
        columns={columns}
        getRowKey={(d) => d.id}
        pageSize={10}
        fullControls
        emptyMessage="No delegates match the selected filters"
      />
    </Stack>
  );
}
