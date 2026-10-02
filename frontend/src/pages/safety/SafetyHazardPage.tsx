/**
 * Safety Hazard Page
 *
 * One hazard of a safety case in full, with its risk before and after
 * mitigation and the incidents that realised it.
 *
 * Part of the safety mock-up, which has no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { Stack } from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import IconTextButton from "@/components/button/IconTextButton";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import HazardDetail from "@/components/safety/HazardDetail";
import { BodyText } from "@/components/typography";
import { hazardById } from "@lib/safety";
import { useSafetyCase } from "./useSafetyCase";

export function Component() {
  const navigate = useNavigate();
  const safetyCase = useSafetyCase();
  const { hazardId } = useParams<{ hazardId: string }>();
  const hazard =
    safetyCase && hazardId ? hazardById(safetyCase, hazardId) : undefined;

  if (!safetyCase || !hazard) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title={`Hazard ${hazard.id}`}
        // For show only, by request: there is no form behind it. See
        // Phase 15 of the plan.
        action={<IconTextButton icon="pencil" label="Edit hazard" />}
      />
      <BodyText c="dimmed">{safetyCase.title}</BodyText>
      <HazardDetail
        hazard={hazard}
        incidents={safetyCase.incidents.filter(
          (incident) => incident.hazard_id === hazard.id,
        )}
        onSelectIncident={(incident) =>
          navigate(`/safety/${safetyCase.id}/incidents/${incident.id}`)
        }
      />
    </Stack>
  );
}
