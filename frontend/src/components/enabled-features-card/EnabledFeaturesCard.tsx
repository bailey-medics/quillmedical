/**
 * Enabled features card
 *
 * The features switched on at one org_unit, as badges, with a pencil
 * that opens the page where they are changed. Shared by the
 * organisation and site admin pages: a site may carry features of its
 * own since 1 October 2026, so the passport can be on for one team
 * without its whole trust.
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import FeatureBadge from "@/components/badge/FeatureBadge";
import IconButton from "@/components/button/IconButton";
import { IconPencil } from "@components/icons/appIcons";
import { EmptyState, Heading } from "@/components/typography";
import { FEATURE_LABELS } from "./featureLabels";

export interface EnabledFeaturesCardProps {
  /** The feature keys switched on here. An unknown key shows as itself. */
  features: string[];
  /** Opens the page where the features are changed. */
  onEdit: () => void;
}

export default function EnabledFeaturesCard({
  features,
  onEdit,
}: EnabledFeaturesCardProps) {
  return (
    <BaseCard>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Heading>Enabled features</Heading>
          <IconButton
            icon={<IconPencil />}
            onClick={onEdit}
            aria-label="Edit features"
          />
        </Group>

        {features.length > 0 ? (
          <Group gap="sm">
            {features.map((key) => (
              <FeatureBadge key={key} label={FEATURE_LABELS[key] ?? key} />
            ))}
          </Group>
        ) : (
          <EmptyState>No features enabled</EmptyState>
        )}
      </Stack>
    </BaseCard>
  );
}
