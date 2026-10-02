/**
 * Safety Page
 *
 * The safety landing page: every safety case, one row each, opening on
 * a page of its own.
 *
 * **This is a mock-up with no backend.** The cases are fixtures, and the
 * page exists only to show what clinical safety content looks like in
 * Quill. See docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import AddIconButton from "@/components/button/AddIconButton";
import SafetyCaseTable from "@/components/safety/SafetyCaseTable";
import { BodyText } from "@/components/typography";
import { SAFETY_CASES } from "@lib/safety";

export function Component() {
  const navigate = useNavigate();

  return (
    <Stack gap="lg">
      <PageHeader title="Safety" />
      <BodyText c="dimmed">
        Demonstration safety cases. Nothing here is a real system, person or
        incident.
      </BodyText>
      <SafetyCaseTable
        // For show only, by request: there is no form behind it. See
        // Phases 15 and 17 of the plan.
        action={<AddIconButton aria-label="Add safety case" />}
        cases={SAFETY_CASES}
        onSelect={(safetyCase) => navigate(`/safety/${safetyCase.id}`)}
      />
    </Stack>
  );
}
