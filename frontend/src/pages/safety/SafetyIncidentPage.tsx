/**
 * Safety Incident Page
 *
 * One incident report of a safety case.
 *
 * Part of the safety mock-up, which has no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { Stack } from "@mantine/core";
import { useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import IconTextButton from "@/components/button/IconTextButton";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import IncidentReport from "@/components/safety/IncidentReport";
import { BodyText } from "@/components/typography";
import { hazardById, incidentById } from "@lib/safety";
import { useSafetyCase } from "./useSafetyCase";

export function Component() {
  const safetyCase = useSafetyCase();
  const { incidentId } = useParams<{ incidentId: string }>();
  const incident =
    safetyCase && incidentId ? incidentById(safetyCase, incidentId) : undefined;

  if (!safetyCase || !incident) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title={`Incident ${incident.id}`}
        // For show only, by request: there is no form behind it. See
        // Phase 15 of the plan.
        action={<IconTextButton icon="pencil" label="Edit incident" />}
      />
      <BodyText c="dimmed">{safetyCase.title}</BodyText>
      <IncidentReport
        incident={incident}
        hazard={hazardById(safetyCase, incident.hazard_id)}
        hazardHref={`/safety/${safetyCase.id}/hazards/${incident.hazard_id}`}
      />
    </Stack>
  );
}
