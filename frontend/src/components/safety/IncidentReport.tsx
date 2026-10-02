/**
 * IncidentReport Component
 *
 * One incident report: what happened, the hazard it realised, what was
 * done at once, why it happened and what changed. Describes a system
 * fault and names a role, never a patient or a person. Part of the
 * safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { Badge, Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import FormattedDate from "@/components/data/Date";
import {
  BodyText,
  BodyTextBold,
  Heading,
  TextLink,
} from "@/components/typography";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "@/components/badge/badgeColours";
import type { Hazard, Incident, IncidentSeverity } from "@lib/safety";

const SEVERITY: Record<
  IncidentSeverity,
  { label: string; colour: BadgeColourConfig }
> = {
  low: { label: "Low", colour: badgeColours.neutral },
  moderate: { label: "Moderate", colour: badgeColours.warning },
  high: { label: "High", colour: badgeColours.alert },
};

export interface IncidentReportProps {
  incident: Incident;
  /** The hazard the incident realised, if the case still has it */
  hazard?: Hazard;
  /** Where the hazard's own page is */
  hazardHref: string;
}

export default function IncidentReport({
  incident,
  hazard,
  hazardHref,
}: IncidentReportProps) {
  const severity = SEVERITY[incident.severity];
  return (
    <Stack gap="lg">
      <BaseCard>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <Heading>What happened</Heading>
            <Badge
              color={severity.colour.bg}
              c={severity.colour.text}
              variant={BADGE_VARIANT}
            >
              {severity.label}
            </Badge>
          </Group>
          <BodyText>{incident.summary}</BodyText>
          <BodyText c="dimmed">
            Occurred <FormattedDate date={incident.occurred_on} format="long" />
            , reported by {incident.reported_by.toLowerCase()}
          </BodyText>
        </Stack>
      </BaseCard>

      <BaseCard>
        <Stack gap="sm">
          <Heading>Hazard realised</Heading>
          <BodyText>
            <TextLink to={hazardHref}>
              {incident.hazard_id}
              {hazard ? `: ${hazard.description}` : ""}
            </TextLink>
          </BodyText>
        </Stack>
      </BaseCard>

      <BaseCard>
        <Stack gap="sm">
          <BodyTextBold>Immediate action</BodyTextBold>
          <BodyText>{incident.immediate_action}</BodyText>
          <BodyTextBold>Root cause</BodyTextBold>
          <BodyText>{incident.root_cause}</BodyText>
          <BodyTextBold>Outcome</BodyTextBold>
          <BodyText>{incident.outcome}</BodyText>
        </Stack>
      </BaseCard>
    </Stack>
  );
}
