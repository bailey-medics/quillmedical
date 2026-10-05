/**
 * The list of guides.
 *
 * Shows the guides written for the reader and for everybody below them,
 * grouped by who each is for, the reader's own group first. See
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
import { EmptyState, Heading } from "@/components/typography";
import { GUIDE_AUDIENCES, type GuideAudience } from "@/guides/registry";
import { useVisibleGuides } from "@lib/guides/useGuideTier";
import { layoutTokens } from "@/theme";

const GROUP_TITLES: Record<GuideAudience, string> = {
  delegate: "For everyone",
  admin: "For admins",
  superadmin: "For Quill operators",
};

export function Component() {
  const guides = useVisibleGuides();
  const useTwoColumns = useMediaQuery(
    `(min-width: ${layoutTokens.actionCardTwoColumnMinWidth})`,
  );

  // Highest first, so what the reader came for is at the top: an admin
  // is here for the admin guides more often than for a delegate's.
  const groups = [...GUIDE_AUDIENCES]
    .reverse()
    .map((audience) => ({
      audience,
      guides: guides.filter((guide) => guide.audience === audience),
    }))
    .filter((group) => group.guides.length > 0);

  return (
    <Stack gap="lg">
      <PageHeader title="Guides" />

      {groups.length === 0 && (
        <EmptyState>There are no guides for you yet.</EmptyState>
      )}

      {groups.map((group) => (
        <Stack key={group.audience} gap="md">
          {/* One group needs no heading: there is nothing to tell apart. */}
          {groups.length > 1 && (
            <Heading>{GROUP_TITLES[group.audience]}</Heading>
          )}
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
  );
}
