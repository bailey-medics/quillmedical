/**
 * Placeholders page of one safety case.
 *
 * Part of the safety mock-up, which has no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import ExtraButton from "@/components/button/ExtraButton";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import PlaceholderTable from "@/components/safety/PlaceholderTable";
import { BodyText } from "@/components/typography";
import { usePlaceholders } from "@lib/safety";
import { useSafetyCase } from "./useSafetyCase";

export function Component() {
  const safetyCase = useSafetyCase();
  const placeholders = usePlaceholders(safetyCase?.id ?? "");

  if (!safetyCase) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Placeholders" />
      <BodyText c="dimmed">{safetyCase.title}</BodyText>
      <BodyText c="dimmed">
        A placeholder is a value written once and substituted into every
        document of the case that names it, so a product name or version changes
        everywhere at the same time.
      </BodyText>
      <PlaceholderTable
        // For show only, by request: there is no form behind it. See
        // Phases 15 and 17 of the plan. The edit page at
        // `/safety/:caseId/placeholders/edit` still exists; nothing on
        // this page links to it now.
        action={<ExtraButton aria-label="Add placeholder" />}
        placeholders={placeholders}
      />
    </Stack>
  );
}
