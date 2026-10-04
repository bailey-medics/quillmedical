/**
 * AdminAllDelegatesPage
 *
 * Admin view showing all delegates across teaching modules.
 * Displays stat cards, a filter popover, and a data table of
 * delegates with learning and assessment status.
 *
 * Only shows delegates belonging to the current user's organisation(s).
 *
 * Results are for one module at a time. An organisation serving more than
 * one module that has an assessment, a real one and a practice one say,
 * gets a module select under the header. Read together, a practice
 * attempt would hide a real pass and count against a first-time pass.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton, SimpleGrid, Stack } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import StatCard from "@/components/stats-card/StatCard";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import SelectField from "@/components/form/SelectField";
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

/** A module with an assessment, to narrow the results by. */
interface DelegateModule {
  bank_id: string;
  title: string;
}

/** The delegates, with results from one module when one is named. */
function delegatesPath(bankId: string | null): string {
  return bankId
    ? `/teaching/admin/delegates?bank_id=${encodeURIComponent(bankId)}`
    : "/teaching/admin/delegates";
}

// ── Columns ─────────────────────────────────────────────────────────

const columns: Column<Delegate>[] = [
  { header: "Name", render: (d) => d.name, accessor: (d) => d.name },
  {
    header: "Site",
    render: (d) => d.site_name ?? "–",
    accessor: (d) => d.site_name ?? "",
  },
  {
    header: "Clinical lead",
    render: (d) => d.clinical_lead ?? "–",
    accessor: (d) => d.clinical_lead ?? "",
  },
  {
    header: "Learning",
    render: (d) => {
      if (d.learning_completed === null) return "–";
      return d.learning_completed ? "Complete" : "In progress";
    },
    accessor: (d) =>
      d.learning_completed === null ? "" : d.learning_completed ? "1" : "0",
  },
  {
    header: "Assessment",
    render: (d) => {
      if (!d.assessment_result) return "–";
      return <AssessmentResultBadge result={d.assessment_result} />;
    },
    accessor: (d) => d.assessment_result ?? "",
  },
  {
    header: "Date",
    render: (d) => {
      if (!d.assessment_date) return "–";
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
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [filteredDelegates, setFilteredDelegates] = useState<Delegate[]>([]);
  const [modules, setModules] = useState<DelegateModule[]>([]);
  const [bankId, setBankId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchPage() {
      try {
        // The modules first: the results asked for depend on which there
        // are. The first is shown to begin with, never all of them mixed.
        const found = await api.get<DelegateModule[]>(
          "/teaching/admin/delegates/modules",
        );
        const first = found[0]?.bank_id ?? null;
        const data = await api.get<Delegate[]>(delegatesPath(first));
        if (!cancelled) {
          setModules(found);
          setBankId(first);
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
    fetchPage();
    return () => {
      cancelled = true;
    };
  }, []);

  async function changeModule(value: string | null) {
    if (!value || value === bankId) return;
    setSwitching(true);
    try {
      const data = await api.get<Delegate[]>(delegatesPath(value));
      setBankId(value);
      setDelegates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load delegates");
    } finally {
      setSwitching(false);
    }
  }

  const moduleOptions = useMemo(
    () => modules.map((m) => ({ value: m.bank_id, label: m.title })),
    [modules],
  );

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

  const filterPredicate = useCallback((filters: string[]) => {
    const siteFilters = filters
      .filter((f) => f.startsWith("site:"))
      .map((f) => f.slice(5));
    const leadFilters = filters
      .filter((f) => f.startsWith("lead:"))
      .map((f) => f.slice(5));
    const firstPassOnly = filters.includes("first-pass-only");

    return (d: Delegate) => {
      if (
        siteFilters.length > 0 &&
        (!d.site_name || !siteFilters.includes(d.site_name))
      ) {
        return false;
      }
      if (
        leadFilters.length > 0 &&
        (!d.clinical_lead || !leadFilters.includes(d.clinical_lead))
      ) {
        return false;
      }
      if (firstPassOnly && !d.first_time_pass) {
        return false;
      }
      return true;
    };
  }, []);

  const searchFields = useCallback(
    (d: Delegate) => [d.name, d.email, d.site_name],
    [],
  );

  const handleFilteredData = useCallback((data: Delegate[]) => {
    setFilteredDelegates(data);
  }, []);

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

  const firstPassRate = calcFirstPassRate(filteredDelegates);

  return (
    <Stack gap="md">
      <PageHeader title="All delegates" />

      {modules.length > 1 && (
        <SelectField
          label="Module"
          data={moduleOptions}
          value={bankId}
          onChange={(value) => void changeModule(value)}
          disabled={switching}
          allowDeselect={false}
        />
      )}

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <StatCard title="Total delegates" value={filteredDelegates.length} />
        <StatCard
          title="Passed"
          value={
            filteredDelegates.filter((d) => d.assessment_result === "pass")
              .length
          }
        />
        <StatCard title="1st pass rate" value={firstPassRate} suffix="%" />
      </SimpleGrid>

      <DataTableControlled
        data={delegates}
        columns={columns}
        getRowKey={(d) => d.id}
        loading={switching}
        pageSize={10}
        filterData={filterOptions}
        filterLabel="Filter delegates"
        filterAriaLabel="Filter delegates"
        searchFields={searchFields}
        filterPredicate={filterPredicate}
        onFilteredData={handleFilteredData}
        emptyMessage="No delegates match the selected filters"
      />
    </Stack>
  );
}
