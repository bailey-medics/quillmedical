/**
 * AssessorDeclaration Component
 *
 * The fixed statement an assessor confirms before signing.
 *
 * This is what makes signing a deliberate act rather than a click. Quill
 * asks for no step-up authentication at the moment of signing — no code,
 * no re-entered password — because a consultant fishing out a phone five
 * times after a clinic is friction landing exactly where adoption is most
 * fragile. What stands in its org_unit is this: somebody reads a statement
 * and puts their name to it, which is what a wet signature has always
 * been.
 *
 * The wording is fixed and lives here rather than being passed in. A
 * declaration a caller could vary is not a declaration — the whole value
 * is that every assessor confirmed the same words, and a record can say
 * which words those were.
 *
 * @example
 * ```tsx
 * <AssessorDeclaration />
 * ```
 */

import type { ReactNode } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { BodyText, BodyTextBold } from "@/components/typography";

/**
 * The declaration text, exported so a test can assert the wording and a
 * form can record exactly what was confirmed.
 */
export const ASSESSOR_DECLARATION_TEXT =
  "I confirm that I have assessed this person against this competency, " +
  "that the record above reflects what I observed or reviewed, and that " +
  "I accept professional accountability for this judgement.";

export interface AssessorDeclarationProps {
  /** Optional heading above the declaration */
  title?: string;
  /**
   * The control that confirms it, shown inside the card.
   *
   * Passed in rather than built here, because the component is also
   * shown where no signing happens and the confirmation belongs to the
   * form that submits it. Inside the card so the statement and the act
   * of agreeing to it read as one thing.
   */
  children?: ReactNode;
}

/**
 * AssessorDeclaration
 *
 * Renders the fixed declaration an assessor confirms. Carries no
 * checkbox of its own: the confirmation control belongs to the form that
 * submits it, so the same words can be shown where no signing happens.
 */
export default function AssessorDeclaration({
  title = "Declaration",
  children,
}: AssessorDeclarationProps) {
  return (
    <BaseCard data-testid="assessor-declaration">
      <Stack gap="xs">
        <BodyTextBold>{title}</BodyTextBold>
        <BodyText>{ASSESSOR_DECLARATION_TEXT}</BodyText>
        {children}
      </Stack>
    </BaseCard>
  );
}
