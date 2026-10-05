/**
 * The list of guides.
 *
 * Shows the guides written for the reader and for everybody below them,
 * grouped by feature and then by who each is for, the reader's own group
 * first. See
 * `docs/docs/plans/2026-10-05-in-app-guides-plan.md`.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { SimpleGrid, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import ActionCard from "@/components/action-card";
import { IconBook } from "@/components/icons/appIcons";
import PageHeader from "@/components/page-header";
import { BodyTextBold, EmptyState, Heading } from "@/components/typography";
import {
  GUIDE_AUDIENCES,
  GUIDE_FEATURES,
  type Guide,
  type GuideAudience,
  type GuideFeature,
} from "@/guides/registry";
import { useVisibleGuides } from "@lib/guides/useGuideTier";
import { layoutTokens } from "@/theme";

const AUDIENCE_TITLES: Record<GuideAudience, string> = {
  everyone: "For everyone",
  admin: "For admins",
  superadmin: "For Quill operators",
};

/** Heads the guides that belong to no one feature. */
const GENERAL_TITLE = "Quill";

interface AudienceGroup {
  audience: GuideAudience;
  guides: Guide[];
}

interface FeatureGroup {
  key: string;
  title: string;
  audiences: AudienceGroup[];
}

/**
 * The guides of one feature, by who each is for. Highest first, so what
 * the reader came for is at the top: an admin is here for the admin
 * guides more often than for everybody's.
 */
function byAudience(guides: Guide[]): AudienceGroup[] {
  return [...GUIDE_AUDIENCES]
    .reverse()
    .map((audience) => ({
      audience,
      guides: guides.filter((guide) => guide.audience === audience),
    }))
    .filter((group) => group.guides.length > 0);
}

/**
 * The guides by feature, in the registry's order of features, with the
 * guides that belong to none first.
 */
function byFeature(guides: Guide[]): FeatureGroup[] {
  const features: (GuideFeature | undefined)[] = [
    undefined,
    ...(Object.keys(GUIDE_FEATURES) as GuideFeature[]),
  ];
  return features
    .map((feature) => ({
      key: feature ?? "general",
      title: feature ? GUIDE_FEATURES[feature] : GENERAL_TITLE,
      audiences: byAudience(guides.filter((g) => g.feature === feature)),
    }))
    .filter((group) => group.audiences.length > 0);
}

export function Component() {
  const guides = useVisibleGuides();
  const useTwoColumns = useMediaQuery(
    `(min-width: ${layoutTokens.actionCardTwoColumnMinWidth})`,
  );

  const features = byFeature(guides);
  // With one feature there is nothing to tell apart, so its name is left
  // out and the audiences take the heading. With several, the feature is
  // the heading and the audience a label beneath it.
  const showsFeatures = features.length > 1;

  return (
    <Stack gap="lg">
      <PageHeader title="Guides" />

      {features.length === 0 && (
        <EmptyState>There are no guides for you yet.</EmptyState>
      )}

      {features.map((feature) => (
        <Stack key={feature.key} gap="md">
          {showsFeatures && <Heading>{feature.title}</Heading>}
          {feature.audiences.map((group) => (
            <Stack key={group.audience} gap="md">
              {/* One audience needs no label: nothing to tell apart. */}
              {feature.audiences.length > 1 &&
                (showsFeatures ? (
                  <BodyTextBold>{AUDIENCE_TITLES[group.audience]}</BodyTextBold>
                ) : (
                  <Heading>{AUDIENCE_TITLES[group.audience]}</Heading>
                ))}
              <SimpleGrid cols={useTwoColumns ? 2 : 1}>
                {group.guides.map((guide) => (
                  <ActionCard
                    key={guide.slug}
                    icon={<IconBook />}
                    title={guide.title}
                    subtitle={guide.summary}
                    buttonLabel="Read guide"
                    buttonUrl={`/guides/${guide.slug}`}
                  />
                ))}
              </SimpleGrid>
            </Stack>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}
