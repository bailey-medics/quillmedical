/**
 * Placeholders edit page of one safety case.
 *
 * Every placeholder's value in one form. Saving writes to the session
 * store, so each document that names a key shows the new value, which
 * is what a placeholder is for. Nothing is kept past a reload.
 *
 * Part of the safety mock-up, which has no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import PlaceholderForm from "@/components/safety/PlaceholderForm";
import { BodyText } from "@/components/typography";
import { setPlaceholderValue, usePlaceholders } from "@lib/safety";
import { useSafetyCase } from "./useSafetyCase";

export function Component() {
  const navigate = useNavigate();
  const safetyCase = useSafetyCase();
  const placeholders = usePlaceholders(safetyCase?.id ?? "");

  if (!safetyCase) {
    return <NotFoundLayout />;
  }

  const back = `/safety/${safetyCase.id}/placeholders`;

  return (
    <Stack gap="lg">
      <PageHeader title="Edit placeholders" />
      <BodyText c="dimmed">{safetyCase.title}</BodyText>
      <BodyText c="dimmed">
        A new value appears in every document that names the key. Edits are kept
        only until the page is reloaded.
      </BodyText>
      <PlaceholderForm
        placeholders={placeholders}
        onSave={(values) => {
          for (const [key, value] of Object.entries(values)) {
            setPlaceholderValue(safetyCase.id, key, value);
          }
          navigate(back);
        }}
        onCancel={() => navigate(back)}
      />
    </Stack>
  );
}
