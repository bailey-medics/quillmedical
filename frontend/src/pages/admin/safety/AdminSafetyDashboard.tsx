/**
 * AdminSafetyDashboard Page
 *
 * Landing page for the admin safety section, as `AdminTeachingDashboard`
 * is for teaching: action cards to the safety cases and to the people
 * pages, where a `manage_safety` holder takes on safety officers and
 * leads within their whitelist.
 *
 * Part of the safety mock-up, which has no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { SimpleGrid, Stack } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import ActionCard from "@/components/action-card/ActionCard";
import { IconShieldCheck, IconUserCheck } from "@/components/icons/appIcons";
import { useHasCompetency } from "@/lib/cbac/hooks";

export default function AdminSafetyDashboard() {
  const canManageSafety = useHasCompetency("manage_safety");

  return (
    <Stack gap="md">
      <PageHeader title="Safety" />

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <ActionCard
          icon={<IconShieldCheck />}
          title="Safety cases"
          subtitle="Every safety case, its hazard log, incidents, officers and sign-off."
          buttonLabel="View safety cases"
          buttonUrl="/safety"
        />
        {canManageSafety && (
          <ActionCard
            icon={<IconUserCheck />}
            title="People"
            subtitle="Sign up safety officers, clinical leads and admins at your organisation or site."
            buttonLabel="View people"
            buttonUrl="/admin/users"
          />
        )}
      </SimpleGrid>
    </Stack>
  );
}
