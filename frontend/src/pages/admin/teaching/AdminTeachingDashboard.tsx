/**
 * AdminTeachingDashboard Page
 *
 * Landing page for admin teaching section. Shows action cards
 * linking to modules management and all delegates view.
 *
 * The Modules card is for an operator who also holds `manage_teaching`,
 * which is what the pages behind it ask: the `teaching/modules` routes
 * sit under `<RequireOperator>`, since syncing a module and setting it
 * live reaches every organisation. A teaching admin of one organisation
 * was shown the card and met a 404 behind it.
 */

import { SimpleGrid, Stack } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import ActionCard from "@/components/action-card/ActionCard";
import { IconStack2, IconUserCheck } from "@/components/icons/appIcons";
import { useAuth } from "@/auth/AuthContext";
import { useHasCompetency } from "@/lib/cbac/hooks";

export default function AdminTeachingDashboard() {
  const { state } = useAuth();
  const isOperator =
    state.status === "authenticated" &&
    state.user.platform_role === "superadmin";
  const canManageTeaching = useHasCompetency("manage_teaching");
  const canOpenModules = isOperator && canManageTeaching;

  return (
    <Stack gap="md">
      <PageHeader title="Teaching" />

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {canOpenModules && (
          <ActionCard
            icon={<IconStack2 />}
            title="Modules"
            subtitle="Manage question banks, sync status, and organisation settings for each teaching module."
            buttonLabel="View modules"
            buttonUrl="/admin/teaching/modules"
          />
        )}
        <ActionCard
          icon={<IconUserCheck />}
          title="All delegates"
          subtitle="View delegate progress, assessment results, and filter by trust or clinical lead."
          buttonLabel="View delegates"
          buttonUrl="/admin/teaching/all-delegates"
        />
      </SimpleGrid>
    </Stack>
  );
}
