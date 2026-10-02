/**
 * Safety Sign-off Detail Page
 *
 * One section of a safety case's compliance sign-off.
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
import SignOffDetail from "@/components/safety/SignOffDetail";
import { BodyText } from "@/components/typography";
import { signOffSectionById } from "@lib/safety";
import { useSafetyCase } from "./useSafetyCase";

export function Component() {
  const safetyCase = useSafetyCase();
  const { sectionId } = useParams<{ sectionId: string }>();
  const item =
    safetyCase && sectionId
      ? signOffSectionById(safetyCase, sectionId)
      : undefined;

  if (!safetyCase || !item) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader title={item.section} />
      <BodyText c="dimmed">{safetyCase.title}</BodyText>
      <SignOffDetail
        item={item}
        documents={safetyCase.documents.filter((document) =>
          item.reviews.includes(document.id),
        )}
        documentHref={(document) =>
          `/safety/${safetyCase.id}/documentation/${document.id}`
        }
      />
    </Stack>
  );
}
