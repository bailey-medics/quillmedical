/**
 * Admin Component Module
 *
 * Administrative dashboard for viewing system statistics.
 * Displays high-level metrics for users and patients.
 * Management actions are now handled by dedicated admin child pages:
 * - /admin/users - User management
 * - /admin/patients - Patient management
 * - /admin/permissions - Permissions management
 */

import { Group, SimpleGrid, Stack } from "@mantine/core";
import StatCard from "@/components/stats-card";
import PageHeader from "@/components/page-header";
import PermissionBadge, {
  type UserPermission,
} from "@/components/badge/PermissionBadge";

interface AdminProps {
  /** Current user's system permissions */
  userPermissions: UserPermission;
  /** Loading state for users statistics */
  usersLoading?: boolean;
  /** Loading state for patients statistics */
  patientsLoading?: boolean;
  /** Loading state for organisations statistics */
  organisationsLoading?: boolean;
  /** Existing users for statistics */
  existingUsers?: Array<{ id: string; username: string; email: string }>;
  /** Existing patients for statistics */
  existingPatients?: Array<{ id: string; name: string }>;
  /** Number of organisations */
  organisationCount?: number;
}

export default function Admin({
  userPermissions,
  usersLoading = false,
  patientsLoading = false,
  organisationsLoading = false,
  existingUsers = [],
  existingPatients = [],
  organisationCount = 0,
}: AdminProps) {
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <PageHeader
          title="Administration"
          description="Manage users, patients, and system permissions"
          size="lg"
          mb={0}
        />
        <PermissionBadge permission={userPermissions} />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <StatCard
          title="Total users"
          value={existingUsers.length}
          loading={usersLoading}
        />
        <StatCard
          title="Total patients"
          value={existingPatients.length}
          loading={patientsLoading}
        />
        <StatCard
          title="Total organisations"
          value={organisationCount}
          loading={organisationsLoading}
        />
      </SimpleGrid>
    </Stack>
  );
}
