/**
 * Officers page of one safety case.
 *
 * Each officer can be edited. The mock-up has nothing to save to, so an
 * edit lives in the session store until the tab is reloaded, and the
 * page says so.
 *
 * Part of the safety mock-up, which has no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import OfficerList from "@/components/safety/OfficerList";
import OfficerEditModal from "@/components/safety/OfficerEditModal";
import { BodyText } from "@/components/typography";
import { setOfficer, useOfficers, type Officer } from "@lib/safety";
import { useSafetyCase } from "./useSafetyCase";

export function Component() {
  const safetyCase = useSafetyCase();
  const officers = useOfficers(safetyCase?.id ?? "");
  const [editing, setEditing] = useState<Officer | null>(null);

  if (!safetyCase) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Officers" />
      <BodyText c="dimmed">{safetyCase.title}</BodyText>
      <BodyText c="dimmed">
        Edits are kept only until the page is reloaded.
      </BodyText>
      <OfficerList officers={officers} onEdit={setEditing} />
      <OfficerEditModal
        officer={editing}
        onClose={() => setEditing(null)}
        onSave={(officer) => setOfficer(safetyCase.id, officer)}
      />
    </Stack>
  );
}
