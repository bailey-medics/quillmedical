/**
 * AdminAllDelegatesPage
 *
 * Admin view showing all delegates across teaching modules.
 * Displays stat cards, a filter popover, and a data table of
 * delegates with learning and assessment status.
 *
 * Currently uses stub data — will be wired to an API endpoint.
 */

import { useCallback, useEffect, useState } from "react";
import { Group, SimpleGrid, Stack } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import StatCard from "@/components/stats-card/StatCard";
import DataTable, { type Column } from "@/components/tables/DataTable";
import FilterSelect from "@/components/form/FilterSelect";
import { useSearch, useSearchFilter } from "@lib/search";
import AssessmentResultBadge from "@/components/badge/AssessmentResultBadge";
import FormattedDate from "@/components/data/Date";

// ── Stub data (replace with API call) ───────────────────────────────

interface Delegate {
  id: number;
  name: string;
  email: string;
  trust: string;
  clinicalLead: string;
  learningCompleted: boolean | null;
  assessmentResult: "pass" | "fail" | "incomplete" | null;
  assessmentDate: string | null;
  firstTimePass: boolean;
}

const FIRST_NAMES = [
  "Sarah",
  "Tom",
  "Emily",
  "Raj",
  "Hannah",
  "Michael",
  "Priya",
  "David",
  "Olivia",
  "James",
  "Aisha",
  "George",
  "Fatima",
  "William",
  "Charlotte",
  "Mohammed",
  "Sophie",
  "Daniel",
  "Grace",
  "Samuel",
  "Chloe",
  "Alex",
  "Amelia",
  "Ben",
  "Lucy",
  "Nathan",
  "Eleanor",
  "Ravi",
  "Megan",
  "Owen",
  "Zara",
  "Liam",
  "Isabella",
  "Ethan",
  "Noor",
  "Caleb",
  "Ruby",
  "Theo",
  "Ava",
  "Finn",
  "Jasmine",
  "Harry",
  "Isla",
  "Leo",
  "Mia",
  "Oscar",
  "Poppy",
  "Jack",
  "Holly",
  "Alfie",
];

const SURNAMES = [
  "Ahmed",
  "Chen",
  "Watson",
  "Patel",
  "Brooks",
  "O'Brien",
  "Sharma",
  "Kim",
  "Thompson",
  "Nguyen",
  "Singh",
  "Williams",
  "Khan",
  "Taylor",
  "Brown",
  "Jones",
  "Ali",
  "Wilson",
  "Davies",
  "Evans",
  "Roberts",
  "Johnson",
  "Walker",
  "Wright",
  "Robinson",
  "Clarke",
  "Hall",
  "Green",
  "Lewis",
  "Wood",
  "Harris",
  "Martin",
  "Jackson",
  "White",
  "Thomas",
  "Moore",
  "Scott",
  "King",
  "Baker",
  "Adams",
  "Mitchell",
  "Campbell",
  "Turner",
  "Parker",
  "Morris",
  "Cook",
  "Murphy",
  "Bell",
  "Reed",
  "Bailey",
];

const TRUSTS = [
  "Leeds Teaching Hospitals",
  "Bradford Teaching Hospitals",
  "Airedale NHS Foundation Trust",
  "Harrogate and District NHS Foundation Trust",
  "Mid Yorkshire Teaching NHS Trust",
];

const CLINICAL_LEADS = [
  "Prof James Morton",
  "Dr Rachel Singh",
  "Dr Karen Fletcher",
  "Prof Andrew Malik",
];

function generateDelegates(count: number): Delegate[] {
  const delegates: Delegate[] = [];
  for (let i = 1; i <= count; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const surname = SURNAMES[i % SURNAMES.length];
    const trust = TRUSTS[i % TRUSTS.length];
    const clinicalLead = CLINICAL_LEADS[i % CLINICAL_LEADS.length];
    const learningCompleted = i % 7 === 0 ? null : i % 3 !== 0;
    const assessmentResult: Delegate["assessmentResult"] =
      i % 7 === 0
        ? null
        : i % 5 === 0
          ? "fail"
          : i % 3 === 0
            ? "incomplete"
            : "pass";
    const assessmentDate =
      assessmentResult && assessmentResult !== "incomplete"
        ? `2026-${String((i % 3) + 3).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`
        : null;
    const firstTimePass = assessmentResult === "pass" && i % 4 !== 0;

    delegates.push({
      id: i,
      name: `Dr ${firstName} ${surname}`,
      email: `${firstName.toLowerCase()}.${surname.toLowerCase().replace("'", "")}@nhs.net`,
      trust,
      clinicalLead,
      learningCompleted,
      assessmentResult,
      assessmentDate,
      firstTimePass,
    });
  }
  return delegates;
}

const DELEGATES = generateDelegates(100);

const FILTER_OPTIONS = [
  {
    group: "Trust",
    items: [...new Set(DELEGATES.map((d) => d.trust))].map((t) => ({
      value: `trust:${t}`,
      label: t,
    })),
  },
  {
    group: "Clinical lead",
    items: [...new Set(DELEGATES.map((d) => d.clinicalLead))].map((l) => ({
      value: `lead:${l}`,
      label: l,
    })),
  },
  {
    group: "Other",
    items: [{ value: "first-pass-only", label: "1st time passers only" }],
  },
];

// ── Columns ─────────────────────────────────────────────────────────

const columns: Column<Delegate>[] = [
  { header: "Name", render: (d) => d.name },
  { header: "Trust", render: (d) => d.trust },
  { header: "Clinical lead", render: (d) => d.clinicalLead },
  {
    header: "Learning",
    render: (d) => {
      if (d.learningCompleted === null) return "—";
      return d.learningCompleted ? "Complete" : "In progress";
    },
  },
  {
    header: "Assessment",
    render: (d) => {
      if (!d.assessmentResult) return "—";
      return <AssessmentResultBadge result={d.assessmentResult} />;
    },
  },
  {
    header: "Date",
    render: (d) => {
      if (!d.assessmentDate) return "—";
      return <FormattedDate date={d.assessmentDate} />;
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

function calcFirstPassRate(delegates: Delegate[]): number {
  const withResult = delegates.filter((d) => d.assessmentResult === "pass");
  if (withResult.length === 0) return 0;
  const firstTimers = withResult.filter((d) => d.firstTimePass);
  return Math.round((firstTimers.length / withResult.length) * 100);
}

// ── Page ─────────────────────────────────────────────────────────────

export default function AdminAllDelegatesPage() {
  const { setShowSearch } = useSearch();
  const [filters, setFilters] = useState<string[]>([]);

  // Enable ribbon search on mount, disable on unmount
  useEffect(() => {
    setShowSearch(true);
    return () => setShowSearch(false);
  }, [setShowSearch]);

  const getSearchText = useCallback(
    (d: Delegate) => `${d.name} ${d.email} ${d.trust}`,
    [],
  );
  const searched = useSearchFilter(DELEGATES, getSearchText);

  const trusts = filters
    .filter((f) => f.startsWith("trust:"))
    .map((f) => f.slice(6));
  const leads = filters
    .filter((f) => f.startsWith("lead:"))
    .map((f) => f.slice(5));
  const firstPassOnly = filters.includes("first-pass-only");

  let filtered = searched;

  if (trusts.length > 0) {
    filtered = filtered.filter((d) => trusts.includes(d.trust));
  }
  if (leads.length > 0) {
    filtered = filtered.filter((d) => leads.includes(d.clinicalLead));
  }
  if (firstPassOnly) {
    filtered = filtered.filter((d) => d.firstTimePass);
  }

  const firstPassRate = calcFirstPassRate(filtered);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <PageHeader title="All delegates" />
        <FilterSelect
          data={FILTER_OPTIONS}
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
          value={filtered.filter((d) => d.assessmentResult === "pass").length}
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
