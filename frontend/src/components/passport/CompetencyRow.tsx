/**
 * CompetencyRow Component
 *
 * One competency's current state, as a single row.
 *
 * Reports counts and never comparisons. The logbook count appears as
 * "38 logbook entries" with no target, no percentage and no ready-or-not
 * verdict, because how many is enough is a judgement belonging to the
 * assessor. A system that appeared to have decided first would invite
 * them to defer to it.
 *
 * `expires_on` is shown and nothing is computed from it. Whether a lapsed
 * sign-off means anything is a clinical decision that has not been made,
 * so the date is there to be read by somebody who can judge it — never
 * rendered as an "expired" state.
 *
 * @example
 * ```tsx
 * <CompetencyRow competency={state} onSelect={openCompetency} />
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
import type { CompetencyState } from "@lib/passport";
import classes from "./CompetencyRow.module.css";

export interface CompetencyRowProps {
  /** The competency's derived state, from the passport index */
  competency: CompetencyState;
  /** Called when the row is chosen, if it should be selectable */
  onSelect?: (competencyId: string) => void;
}

/**
 * The detail line beneath the name: level, who signed and when, and the
 * evidence count. Assembled as pieces so the mobile and desktop layouts
 * render the same facts.
 */
function CompetencyDetail({ competency }: { competency: CompetencyState }) {
  const { level, signed_off_by, signed_on, expires_on, logbook_entries } =
    competency;

  return (
    <Stack gap={2}>
      {level && <BodyTextInline>{level.name}</BodyTextInline>}

      {signed_off_by && signed_on && (
        <BodyText c="dimmed">
          Signed off by {signed_off_by} on{" "}
          <FormattedDate date={signed_on} format="medium" />
        </BodyText>
      )}

      {expires_on && (
        <BodyText c="dimmed">
          Review due <FormattedDate date={expires_on} format="medium" />
        </BodyText>
      )}

      {logbook_entries > 0 && (
        <BodyText c="dimmed">
          {logbook_entries} logbook{" "}
          {logbook_entries === 1 ? "entry" : "entries"}
        </BodyText>
      )}
    </Stack>
  );
}

/**
 * CompetencyRow
 *
 * Renders one competency's name, status and detail. Becomes a button when
 * `onSelect` is given, and stays inert text otherwise.
 */
export default function CompetencyRow({
  competency,
  onSelect,
}: CompetencyRowProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  const content = isMobile ? (
    <Stack gap="xs" w="100%">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <BodyTextBold>{competency.name}</BodyTextBold>
        <SignOffStatusBadge status={competency.status} />
      </Group>
      <CompetencyDetail competency={competency} />
    </Stack>
  ) : (
    <Group justify="space-between" wrap="nowrap" align="flex-start" w="100%">
      <Stack gap={2}>
        <BodyTextBold>{competency.name}</BodyTextBold>
        <CompetencyDetail competency={competency} />
      </Stack>
      <SignOffStatusBadge status={competency.status} />
    </Group>
  );

  if (!onSelect) {
    return (
      <div className={classes.row} data-testid="competency-row">
        {content}
      </div>
    );
  }

  return (
    <UnstyledButton
      className={classes.row}
      data-testid="competency-row"
      onClick={() => onSelect(competency.id)}
      aria-label={competency.name}
    >
      {content}
    </UnstyledButton>
  );
}
