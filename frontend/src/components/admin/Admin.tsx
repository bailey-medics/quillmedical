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

import { Badge, Group, Stack } from "@mantine/core";
import StatCard from "@/components/stats-card";
import PageHeader from "@/components/page-header";
import type { SystemPermission } from "@/types/cbac";

interface AdminProps {
  /** Current user's system permissions */
  userPermissions: SystemPermission;
  /** Loading state for users statistics */
  usersLoading?: boolean;
  /** Loading state for patients statistics */
  patientsLoading?: boolean;
  /** Existing users for statistics */
  existingUsers?: Array<{ id: string; username: string; email: string }>;
  /** Existing patients for statistics */
  existingPatients?: Array<{ id: string; name: string }>;
}

export default function Admin({
  userPermissions,
  usersLoading = false,
  patientsLoading = false,
  existingUsers = [],
  existingPatients = [],
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
        <Badge
          size="xl"
          variant="filled"
          color={
            userPermissions === "superadmin"
              ? "green"
              : userPermissions === "admin"
                ? "blue"
                : "gray"
          }
        >
          {userPermissions.toUpperCase()}
        </Badge>
      </Group>

      <Group grow>
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
      </Group>
    </Stack>
  );
}
