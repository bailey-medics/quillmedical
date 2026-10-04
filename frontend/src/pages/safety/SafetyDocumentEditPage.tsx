/**
 * Safety Document Edit Page
 *
 * Edit one document's markdown. Saving writes to the session store, and
 * the document page renders it with the case's placeholders filled in.
 * Nothing is kept past a reload.
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
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import DocumentForm from "@/components/safety/DocumentForm";
import { BodyText } from "@/components/typography";
import {
  safetyDocumentById,
  setDocumentContent,
  useDocumentContent,
} from "@lib/safety";
import { useSafetyCase } from "./useSafetyCase";

export function Component() {
  const navigate = useNavigate();
  const safetyCase = useSafetyCase();
  const { documentId } = useParams<{ documentId: string }>();
  const document =
    safetyCase && documentId
      ? safetyDocumentById(safetyCase, documentId)
      : undefined;
  const content = useDocumentContent(safetyCase?.id ?? "", documentId ?? "");

  if (!safetyCase || !document || content === undefined) {
    return <NotFoundLayout />;
  }

  const back = `/safety/${safetyCase.id}/documentation/${document.id}`;

  return (
    <Stack gap="lg">
      <PageHeader title={`Edit ${document.name.toLowerCase()}`} />
      <BodyText c="dimmed">{safetyCase.title}</BodyText>
      <BodyText c="dimmed">
        Edits are kept only until the page is reloaded.
      </BodyText>
      <DocumentForm
        initial={content}
        onSave={(next) => {
          setDocumentContent(safetyCase.id, document.id, next);
          navigate(back);
        }}
        onCancel={() => navigate(back)}
      />
    </Stack>
  );
}
