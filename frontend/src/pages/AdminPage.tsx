/**
 * Admin Page Module
 *
 * Administrative interface for managing users, patients, and permissions.
 * Only accessible to users with admin or superadmin permissions.
 */

import { Container } from "@mantine/core";
import Admin from "@/components/admin/Admin";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import type { SystemPermission } from "@/types/cbac";
import { useEffect, useState } from "react";

/**
 * API User Response
 */
interface ApiUser {
  id: number;
  username: string;
  email: string;
}

/**
 * API Patient Response (FHIR Patient)
 */
interface ApiPatient {
  id: string;
  name: Array<{ given?: string[]; family?: string }>;
}

/**
 * Admin Page
 *
 * Wraps the Admin component and provides it with user permissions from
 * the auth context. Fetches and manages user and patient data from the API.
 *
 * @returns Admin page component
 */
export default function AdminPage() {
  const { state } = useAuth();
  const [users, setUsers] = useState<
    Array<{ id: string; username: string; email: string }>
  >([]);
  const [patients, setPatients] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [loading, setLoading] = useState(true);

  // Extract system permissions from auth state
  const userPermissions: SystemPermission =
    state.status === "authenticated"
      ? (state.user.system_permissions as SystemPermission)
      : "patient";

  // Fetch users and patients
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      // Only fetch if user is authenticated and has admin permissions
      if (
        state.status !== "authenticated" ||
        !["admin", "superadmin"].includes(userPermissions)
      ) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch users and patients in parallel
        const [usersResponse, patientsResponse] = await Promise.all([
          api.get<{ users: ApiUser[] }>("/users"),
          api.get<{ patients: ApiPatient[] }>("/patients"),
        ]);

        if (!cancelled) {
          setUsers(
            usersResponse.users.map((u) => ({
              id: String(u.id),
              username: u.username,
              email: u.email,
            })),
          );

          setPatients(
            patientsResponse.patients.map((p) => {
              const name = p.name?.[0];
              const givenName = name?.given?.[0] || "";
              const familyName = name?.family || "";
              return {
                id: p.id,
                name: `${givenName} ${familyName}`.trim() || "Unknown",
              };
            }),
          );
        }
      } catch (error) {
        console.error("Failed to fetch admin data:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [state.status, userPermissions]);

  // TODO: Wire up actual API callbacks for:
  // - onAddUser
  // - onAddPatient
  // - onLinkUserPatient
  // - onUpdatePermissions

  return (
    <Container size="lg" pt="xl">
      <Admin
        userPermissions={userPermissions}
        existingUsers={users}
        existingPatients={patients}
        loading={loading}
      />
    </Container>
  );
}
