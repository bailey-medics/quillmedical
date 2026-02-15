/**
 * Admin Page Module
 *
 * Administrative interface for managing users, patients, and permissions.
 * Only accessible to users with admin or superadmin permissions.
 */

import { Container } from "@mantine/core";
import Admin from "@/components/admin/Admin";
import { useAuth } from "@/auth/AuthContext";
import type { SystemPermission } from "@/types/cbac";

/**
 * Admin Page
 *
 * Wraps the Admin component and provides it with user permissions from
 * the auth context. Handles all user management, patient management,
 * linking, and permission updates.
 *
 * @returns Admin page component
 */
export default function AdminPage() {
  const { state } = useAuth();

  // Extract system permissions from auth state
  const userPermissions: SystemPermission =
    state.status === "authenticated"
      ? (state.user.system_permissions as SystemPermission)
      : "patient";

  // TODO: Wire up actual API callbacks for:
  // - onAddUser
  // - onAddPatient
  // - onLinkUserPatient
  // - onUpdatePermissions
  // - existingUsers (fetch from API)
  // - existingPatients (fetch from API)

  return (
    <Container size="lg" pt="xl">
      <Admin userPermissions={userPermissions} />
    </Container>
  );
}
