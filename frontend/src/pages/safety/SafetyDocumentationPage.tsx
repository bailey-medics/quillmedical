/**
 * Documentation page of one safety case.
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
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import DocumentTable from "@/components/safety/DocumentTable";
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
      <PageHeader title="Documentation" />
      <BodyText c="dimmed">{safetyCase.title}</BodyText>
      <DocumentTable
        documents={safetyCase.documents}
        onSelect={(document) =>
          navigate(`/safety/${safetyCase.id}/documentation/${document.id}`)
        }
      />
    </Stack>
  );
}
