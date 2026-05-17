/**
 * AdminAllDelegatesPage
 *
 * Admin view showing all delegates across teaching modules.
 * Displays stat cards, a filter popover, and a data table of
 * delegates with learning and assessment status.
 *
 * Currently uses stub data — will be wired to an API endpoint.
 */

import { useState } from "react";
import { Container, Group, SimpleGrid, Stack } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import StatCard from "@/components/stats-card/StatCard";
import DataTable, { type Column } from "@/components/tables/DataTable";
import FilterSelect from "@/components/form/FilterSelect";
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

const DELEGATES: Delegate[] = [
  {
    id: 1,
    name: "Dr Sarah Ahmed",
    email: "s.ahmed@nhs.net",
    trust: "Leeds Teaching Hospitals",
    clinicalLead: "Prof James Morton",
    learningCompleted: true,
    assessmentResult: "pass",
    assessmentDate: "2026-05-10",
    firstTimePass: true,
  },
  {
    id: 2,
    name: "Dr Tom Chen",
    email: "t.chen@nhs.net",
    trust: "Leeds Teaching Hospitals",
    clinicalLead: "Prof James Morton",
    learningCompleted: true,
    assessmentResult: "fail",
    assessmentDate: "2026-05-08",
    firstTimePass: false,
  },
  {
    id: 3,
    name: "Dr Emily Watson",
    email: "e.watson@nhs.net",
    trust: "Bradford Teaching Hospitals",
    clinicalLead: "Dr Rachel Singh",
    learningCompleted: true,
    assessmentResult: "pass",
    assessmentDate: "2026-05-12",
    firstTimePass: true,
  },
  {
    id: 4,
    name: "Dr Raj Patel",
    email: "r.patel@nhs.net",
    trust: "Bradford Teaching Hospitals",
    clinicalLead: "Dr Rachel Singh",
    learningCompleted: false,
    assessmentResult: "incomplete",
    assessmentDate: null,
    firstTimePass: false,
  },
  {
    id: 5,
    name: "Dr Hannah Brooks",
    email: "h.brooks@nhs.net",
    trust: "Airedale NHS Foundation Trust",
    clinicalLead: "Dr Rachel Singh",
    learningCompleted: true,
    assessmentResult: "pass",
    assessmentDate: "2026-04-28",
    firstTimePass: false,
  },
  {
    id: 6,
    name: "Dr Michael O'Brien",
    email: "m.obrien@nhs.net",
    trust: "Airedale NHS Foundation Trust",
    clinicalLead: "Prof James Morton",
    learningCompleted: null,
    assessmentResult: "pass",
    assessmentDate: "2026-05-15",
    firstTimePass: true,
  },
  {
    id: 7,
    name: "Dr Priya Sharma",
    email: "p.sharma@nhs.net",
    trust: "Leeds Teaching Hospitals",
    clinicalLead: "Prof James Morton",
    learningCompleted: true,
    assessmentResult: "pass",
    assessmentDate: "2026-05-14",
    firstTimePass: true,
  },
  {
    id: 8,
    name: "Dr David Kim",
    email: "d.kim@nhs.net",
    trust: "Bradford Teaching Hospitals",
    clinicalLead: "Dr Rachel Singh",
    learningCompleted: false,
    assessmentResult: null,
    assessmentDate: null,
    firstTimePass: false,
  },
];

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
  const [filters, setFilters] = useState<string[]>([]);

  const trusts = filters
    .filter((f) => f.startsWith("trust:"))
    .map((f) => f.slice(6));
  const leads = filters
    .filter((f) => f.startsWith("lead:"))
    .map((f) => f.slice(5));
  const firstPassOnly = filters.includes("first-pass-only");

  let filtered = DELEGATES;

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
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="All delegates" />

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <StatCard title="Total delegates" value={filtered.length} />
          <StatCard
            title="Passed"
            value={filtered.filter((d) => d.assessmentResult === "pass").length}
          />
          <StatCard title="1st pass rate" value={firstPassRate} suffix="%" />
        </SimpleGrid>

        <Group justify="flex-end">
          <FilterSelect
            data={FILTER_OPTIONS}
            value={filters}
            onChange={setFilters}
            label="Filter delegates"
            aria-label="Filter delegates"
          />
        </Group>

        <DataTable
          data={filtered}
          columns={columns}
          getRowKey={(d) => d.id}
          emptyMessage="No delegates match the selected filters"
        />
      </Stack>
    </Container>
  );
}
