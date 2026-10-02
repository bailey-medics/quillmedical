/**
 * Safety Document Page
 *
 * One document of a safety case, rendered from its markdown with the
 * case's placeholders filled in and laid out as an A4 page.
 *
 * Part of the safety mock-up, which has no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { Stack } from "@mantine/core";
import { useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import SafetyDocumentSheet from "@/components/safety/SafetyDocumentSheet";
import { BodyText } from "@/components/typography";
import { renderDocument, safetyDocumentById } from "@lib/safety";
import { useSafetyCase } from "./useSafetyCase";

export function Component() {
  const safetyCase = useSafetyCase();
  const { documentId } = useParams<{ documentId: string }>();
  const document =
    safetyCase && documentId
      ? safetyDocumentById(safetyCase, documentId)
      : undefined;

  if (!safetyCase || !document) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader title={document.name} />
      <BodyText c="dimmed">{safetyCase.title}</BodyText>
      <SafetyDocumentSheet
        document={document}
        product={safetyCase.system}
        content={renderDocument(document, safetyCase.placeholders)}
      />
    </Stack>
  );
}
