/**
 * HazardDetail Component
 *
 * One hazard in full: what it is, its risk before and after mitigation
 * with the likelihood and severity spelt out, the mitigation itself,
 * and the incidents that realised it. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { Badge, Group, SimpleGrid, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { BodyText, BodyTextBold, Heading } from "@/components/typography";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "@/components/badge/badgeColours";
import RiskScoreBadge from "./RiskScoreBadge";
import IncidentTable from "./IncidentTable";
import {
  likelihoodWord,
  riskBand,
  riskRating,
  severityWord,
  type Hazard,
  type HazardStatus,
  type Incident,
  type RiskScore,
} from "@lib/safety";

const STATUS: Record<
  HazardStatus,
  { label: string; colour: BadgeColourConfig }
> = {
  open: { label: "Open", colour: badgeColours.alert },
  mitigated: { label: "Mitigated", colour: badgeColours.warning },
  closed: { label: "Closed", colour: badgeColours.success },
};

const BAND_LABEL = {
  acceptable: "Acceptable",
  tolerable: "Tolerable, review",
  undesirable: "Undesirable",
  unacceptable: "Unacceptable without mitigation",
} as const;

function RiskCard({
  title,
  likelihood,
  severity,
}: {
  title: string;
  likelihood: RiskScore;
  severity: RiskScore;
}) {
  const rating = riskRating(likelihood, severity);
  return (
    <BaseCard>
      <Stack gap="sm">
        <Heading>{title}</Heading>
        <Group gap="md">
          <RiskScoreBadge likelihood={likelihood} severity={severity} />
          <BodyText>{BAND_LABEL[riskBand(rating)]}</BodyText>
        </Group>
        <BodyText>
          Likelihood {likelihood} of 5, {likelihoodWord(likelihood)}
        </BodyText>
        <BodyText>
          Severity {severity} of 5, {severityWord(severity)}
        </BodyText>
        <BodyText c="dimmed">
          Rating is likelihood times severity: {likelihood} × {severity} ={" "}
          {rating}
        </BodyText>
      </Stack>
    </BaseCard>
  );
}

export interface HazardDetailProps {
  hazard: Hazard;
  /** The incidents on the case that realised this hazard */
  incidents: Incident[];
  /** Called when an incident is chosen */
  onSelectIncident?: (incident: Incident) => void;
}

export default function HazardDetail({
  hazard,
  incidents,
  onSelectIncident,
}: HazardDetailProps) {
  const status = STATUS[hazard.status];
  return (
    <Stack gap="lg">
      <BaseCard>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <Heading>{hazard.description}</Heading>
            <Badge
              color={status.colour.bg}
              c={status.colour.text}
              variant={BADGE_VARIANT}
            >
              {status.label}
            </Badge>
          </Group>
          <BodyTextBold>Cause</BodyTextBold>
          <BodyText>{hazard.cause}</BodyText>
          <BodyTextBold>Effect</BodyTextBold>
          <BodyText>{hazard.effect}</BodyText>
        </Stack>
      </BaseCard>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <RiskCard
          title="Initial risk"
          likelihood={hazard.initial_likelihood}
          severity={hazard.initial_severity}
        />
        <RiskCard
          title="Residual risk"
          likelihood={hazard.residual_likelihood}
          severity={hazard.residual_severity}
        />
      </SimpleGrid>

      <BaseCard>
        <Stack gap="sm">
          <Heading>Mitigation</Heading>
          <BodyText>{hazard.mitigation}</BodyText>
        </Stack>
      </BaseCard>

      <BaseCard>
        <Stack gap="sm">
          <Heading>Incidents</Heading>
          <IncidentTable incidents={incidents} onSelect={onSelectIncident} />
        </Stack>
      </BaseCard>
    </Stack>
  );
}
