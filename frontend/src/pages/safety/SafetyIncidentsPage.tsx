/**
 * Incidents page of one safety case.
 *
 * Part of the safety mock-up, which has no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import IncidentTable from "@/components/safety/IncidentTable";
import { BodyText } from "@/components/typography";
import { useSafetyCase } from "./useSafetyCase";

export function Component() {
  const navigate = useNavigate();
  const safetyCase = useSafetyCase();

  if (!safetyCase) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Incidents"
        // For show only, by request: there is no form behind it. See
        // Phase 15 of the plan.
        action={<AddButton label="Add incident" />}
      />
      <BodyText c="dimmed">{safetyCase.title}</BodyText>
      <IncidentTable
        incidents={safetyCase.incidents}
        onSelect={(incident) =>
          navigate(`/safety/${safetyCase.id}/incidents/${incident.id}`)
        }
      />
    </Stack>
  );
}
