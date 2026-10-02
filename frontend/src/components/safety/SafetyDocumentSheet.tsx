/**
 * SafetyDocumentSheet Component
 *
 * One safety case document laid out as an A4 page: a header block naming
 * the document, product, version, status and date, then the rendered
 * markdown. The content arrives already rendered, so the sheet knows
 * nothing about placeholders. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * @example
 * ```tsx
 * <SafetyDocumentSheet
 *   document={document}
 *   product="MedScribe EPMA 4.2"
 *   content={renderDocument(document, placeholders)}
 * />
 * ```
 */

import { Box, Group, Stack } from "@mantine/core";
import {
  BodyText,
  BodyTextBold,
  Heading,
  MarkdownView,
} from "@/components/typography";
import FormattedDate from "@/components/data/Date";
import type { SafetyDocument } from "@lib/safety";
import classes from "./SafetyDocumentSheet.module.css";

export interface SafetyDocumentSheetProps {
  /** The document, for its name, version and status */
  document: SafetyDocument;
  /** The system the case is about, named in the header */
  product: string;
  /** The document's markdown with placeholders already filled in */
  content: string;
}

export default function SafetyDocumentSheet({
  document,
  product,
  content,
}: SafetyDocumentSheetProps) {
  return (
    <Box className={classes.sheet} data-testid="safety-document-sheet">
      <Stack gap={4} className={classes.meta}>
        <Heading>{document.name}</Heading>
        <BodyTextBold>{product}</BodyTextBold>
        <Group gap="xs">
          <BodyText c="dimmed">
            {document.name}, version {document.version},{" "}
            {document.status === "approved" ? "approved" : "draft"}
          </BodyText>
        </Group>
        <BodyText c="dimmed">
          Last updated{" "}
          <FormattedDate date={document.updated_on} format="long" />
        </BodyText>
      </Stack>
      <MarkdownView source={content} />
    </Box>
  );
}
