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
import { FHIR_POLLING_TIME } from "@/lib/constants";
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
 * Patients API Response (including FHIR readiness flag)
 */
interface PatientsApiResponse {
  patients: ApiPatient[];
  fhir_ready: boolean;
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
  const [usersLoading, setUsersLoading] = useState(true);
  const [patientsLoading, setPatientsLoading] = useState(true);

  // Extract system permissions from auth state
  const userPermissions: SystemPermission =
    state.status === "authenticated"
      ? (state.user.system_permissions as SystemPermission)
      : "patient";

  // Fetch users (loads immediately)
  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      // Only fetch if user is authenticated and has admin permissions
      if (
        state.status !== "authenticated" ||
        !["admin", "superadmin"].includes(userPermissions)
      ) {
        setUsersLoading(false);
        return;
      }

      try {
        setUsersLoading(true);
        const usersResponse = await api.get<{ users: ApiUser[] }>("/users");

        if (!cancelled) {
          setUsers(
            usersResponse.users.map((u) => ({
              id: String(u.id),
              username: u.username,
              email: u.email,
            })),
          );
        }
      } catch (error) {
        console.error("Failed to fetch users:", error);
      } finally {
        if (!cancelled) {
          setUsersLoading(false);
        }
      }
    }

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [state.status, userPermissions]);

  // Fetch patients (waits for FHIR to be ready)
  useEffect(() => {
    let cancelled = false;

    async function fetchPatients() {
      // Only fetch if user is authenticated and has admin permissions
      if (
        state.status !== "authenticated" ||
        !["admin", "superadmin"].includes(userPermissions)
      ) {
        setPatientsLoading(false);
        return;
      }

      try {
        setPatientsLoading(true);
        const patientsResponse =
          await api.get<PatientsApiResponse>("/patients");

        if (!cancelled) {
          // Check if FHIR is ready
          if (patientsResponse.fhir_ready) {
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
            setPatientsLoading(false);
          } else {
            // FHIR not ready yet, keep loading and retry
            setTimeout(() => {
              if (!cancelled) {
                fetchPatients();
              }
            }, FHIR_POLLING_TIME);
          }
        }
      } catch (error) {
        console.error("Failed to fetch patients:", error);
        // On error, stop loading after a delay and retry
        setTimeout(() => {
          if (!cancelled) {
            fetchPatients();
          }
        }, FHIR_POLLING_TIME);
      }
    }

    fetchPatients();

    return () => {
      cancelled = true;
    };
  }, [state.status, userPermissions]);

  // TODO: Wire up actual API callbacks for:
  // - onLinkUserPatient
  // - onUpdatePermissions
  // Note: User and patient creation now handled by dedicated pages (/admin/users/new, /admin/patients/new)

  return (
    <Container size="lg" pt="xl">
      <Admin
        userPermissions={userPermissions}
        existingUsers={users}
        existingPatients={patients}
        usersLoading={usersLoading}
        patientsLoading={patientsLoading}
      />
    </Container>
  );
}
