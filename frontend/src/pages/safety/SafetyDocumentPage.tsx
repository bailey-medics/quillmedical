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
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { Stack } from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import IconTextButton from "@/components/button/IconTextButton";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import SafetyDocumentSheet from "@/components/safety/SafetyDocumentSheet";
import { BodyText } from "@/components/typography";
import {
  renderDocument,
  safetyDocumentById,
  useDocumentContent,
  usePlaceholders,
} from "@lib/safety";
import { useSafetyCase } from "./useSafetyCase";

export function Component() {
  const navigate = useNavigate();
  const safetyCase = useSafetyCase();
  const { documentId } = useParams<{ documentId: string }>();
  // Through the session store, so an edited placeholder shows here.
  const placeholders = usePlaceholders(safetyCase?.id ?? "");
  const content = useDocumentContent(safetyCase?.id ?? "", documentId ?? "");
  const document =
    safetyCase && documentId
      ? safetyDocumentById(safetyCase, documentId)
      : undefined;

  if (!safetyCase || !document || content === undefined) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title={document.name}
        action={
          <IconTextButton
            icon="pencil"
            label="Edit document"
            onClick={() =>
              navigate(
                `/safety/${safetyCase.id}/documentation/${document.id}/edit`,
              )
            }
          />
        }
      />
      <BodyText c="dimmed">{safetyCase.title}</BodyText>
      <SafetyDocumentSheet
        document={document}
        product={safetyCase.system}
        content={renderDocument({ ...document, content }, placeholders)}
      />
    </Stack>
  );
}
