/**
 * SignOffRow Component
 *
 * One sign-off, as a single row: which competency, at what level, where
 * it stands, and who signed it when.
 *
 * `CompetencyRow` is the other row in a passport, and the two answer
 * different questions. A competency row says where a competency stands
 * now, from its latest sign-off alone; this says what one sign-off was.
 * A competency declined once and signed off later is one competency row
 * and two of these.
 *
 * `expires_on` is shown and nothing is computed from it, for the reason
 * `CompetencyRow` gives: what a lapsed sign-off means is a clinical
 * decision nobody has made.
 *
 * @example
 * ```tsx
 * <SignOffRow signOff={signOff} onSelect={openSignOff} />
 * ```
 */

import { Group, Stack, UnstyledButton, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import SignOffStatusBadge from "@/components/badge/SignOffStatusBadge";
import FormattedDate from "@/components/data/Date";
import {
  BodyText,
  BodyTextBold,
  BodyTextInline,
} from "@/components/typography";
import type { SignOff } from "@lib/passport";
import { nameWithScope } from "@lib/passport/scopes";
import classes from "./SignOffRow.module.css";

export interface SignOffRowProps {
  /** The sign-off */
  signOff: SignOff;
  /** Called with the sign-off's name when chosen, if it is selectable */
  onSelect?: (name: string) => void;
}

/** The facts beneath the competency's name, the same on phone and desktop. */
function SignOffDetail({ signOff }: { signOff: SignOff }) {
  const {
    status,
    level,
    requested_level,
    observed_on,
    signed_at,
    signed_off_by,
    expires_on,
    assessor_email,
  } = signOff;

  // While requested, `level` is what was asked for; once decided, it is
  // what the assessor signed, and the ask is shown beside it only where
  // the two differ.
  const asked = status === "requested" ? (requested_level ?? level) : null;
  const changed =
    status !== "requested" &&
    level != null &&
    requested_level != null &&
    level.id !== requested_level.id;

  return (
    <Stack gap={2}>
      {asked && <BodyTextInline>Asked for: {asked.name}</BodyTextInline>}
      {!asked && level && <BodyTextInline>{level.name}</BodyTextInline>}
      {changed && (
        <BodyText c="dimmed">You asked for: {requested_level.name}</BodyText>
      )}

      <BodyText c="dimmed">
        Observed <FormattedDate date={observed_on} format="medium" />
      </BodyText>

      {/* Who was asked, which the signed record does not say: until
          somebody signs, it is the only name the row has. */}
      {assessor_email && (
        <BodyText c="dimmed">Sent to {assessor_email}</BodyText>
      )}

      {signed_off_by && signed_at && (
        <BodyText c="dimmed">
          Signed off by {signed_off_by.name} on{" "}
          <FormattedDate date={signed_at.slice(0, 10)} format="medium" />
        </BodyText>
      )}

      {expires_on && (
        <BodyText c="dimmed">
          Review due <FormattedDate date={expires_on} format="medium" />
        </BodyText>
      )}
    </Stack>
  );
}

/**
 * SignOffRow
 *
 * Renders one sign-off. Becomes a button when `onSelect` is given, and
 * stays inert text otherwise.
 */
export default function SignOffRow({ signOff, onSelect }: SignOffRowProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  const badge = <SignOffStatusBadge status={signOff.status} />;

  const content = isMobile ? (
    <Stack gap="xs" w="100%">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <BodyTextBold>
          {nameWithScope(signOff.competency.name, signOff.scope)}
        </BodyTextBold>
        {badge}
      </Group>
      <SignOffDetail signOff={signOff} />
    </Stack>
  ) : (
    <Group justify="space-between" wrap="nowrap" align="flex-start" w="100%">
      <Stack gap={2}>
        <BodyTextBold>
          {nameWithScope(signOff.competency.name, signOff.scope)}
        </BodyTextBold>
        <SignOffDetail signOff={signOff} />
      </Stack>
      {badge}
    </Group>
  );

  if (!onSelect) {
    return (
      <div className={classes.row} data-testid="sign-off-row">
        {content}
      </div>
    );
  }

  return (
    <UnstyledButton
      className={classes.row}
      data-testid="sign-off-row"
      onClick={() => onSelect(signOff.name)}
      aria-label={nameWithScope(signOff.competency.name, signOff.scope)}
    >
      {content}
    </UnstyledButton>
  );
}
