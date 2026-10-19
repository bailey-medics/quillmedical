/**
 * Admin Page Module
 *
 * Administrative interface for managing users, patients, and permissions.
 * Only accessible to users with admin or superadmin permissions.
 */

import Admin from "@/components/admin";
import { useAuth } from "@/auth/AuthContext";
import { useHasCompetency } from "@/lib/cbac/hooks";
import { api } from "@/lib/api";
import { orgUnits } from "@/domains/orgUnit";
import { FHIR_POLLING_TIME } from "@/lib/constants";
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
 * Patient count response (including FHIR readiness flag). A number and
 * nothing else: the page shows a count, so it never fetches the list.
 */
interface PatientCountResponse {
  total: number;
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
  const [patientCount, setPatientCount] = useState(0);
  const [organisationCount, setOrganisationCount] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [organisationsLoading, setOrganisationsLoading] = useState(true);

  const clinicalServicesEnabled =
    state.status === "authenticated"
      ? state.user.clinical_services_enabled !== false
      : true;

  // Whether this deployment has FHIR and EHRbase at all. Same test as
  // LoginPage and UserInfoUpdatePage rather than a new one.
  const isClinical = import.meta.env.VITE_CLINICAL_SERVICES_ENABLED !== "false";

  // The patient admin pages stay `manage_users`-only. A teaching admin
  // reaches this page through `manage_teaching`, so their patients are
  // neither fetched nor counted.
  const managesPatients = useHasCompetency("manage_users");

  // Fetch users (loads immediately)
  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      if (state.status !== "authenticated") {
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

    void fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [state.status]);

  // Fetch the patient count (waits for FHIR to be ready)
  useEffect(() => {
    let cancelled = false;

    async function fetchPatients() {
      // Nothing to wait for where there is no FHIR. The retry below
      // exists because FHIR takes time to come up, so a failure is
      // normally "not ready yet" - but in a teaching deployment
      // /patients/count answers 503 permanently, and the catch cannot
      // tell the two apart. One admin tab left open then polls every five
      // seconds for as long as it is open, which is exactly what
      // happened: 127 deliberate 503s logged at ERROR in thirteen
      // minutes.
      if (!isClinical || !managesPatients) {
        setPatientsLoading(false);
        return;
      }

      if (state.status !== "authenticated") {
        setPatientsLoading(false);
        return;
      }

      try {
        setPatientsLoading(true);
        const countResponse =
          await api.get<PatientCountResponse>("/patients/count");

        if (!cancelled) {
          // Check if FHIR is ready
          if (countResponse.fhir_ready) {
            setPatientCount(countResponse.total);
            setPatientsLoading(false);
          } else {
            // FHIR not ready yet, keep loading and retry
            setTimeout(() => {
              if (!cancelled) {
                void fetchPatients();
              }
            }, FHIR_POLLING_TIME);
          }
        }
      } catch (error) {
        console.error("Failed to fetch the patient count:", error);
        // On error, stop loading after a delay and retry
        setTimeout(() => {
          if (!cancelled) {
            void fetchPatients();
          }
        }, FHIR_POLLING_TIME);
      }
    }

    void fetchPatients();

    return () => {
      cancelled = true;
    };
  }, [state.status, isClinical, managesPatients]);

  // Fetch organisations
  useEffect(() => {
    let cancelled = false;

    async function fetchOrganisations() {
      if (state.status !== "authenticated") {
        setOrganisationsLoading(false);
        return;
      }

      try {
        setOrganisationsLoading(true);
        // The organisations are the org_units at the top of a tree, which
        // is what the admin screens have counted since they moved onto
        // the org_unit surface.
        const organisations = await orgUnits.list({ roots: true });

        if (!cancelled) {
          setOrganisationCount(organisations.length);
        }
      } catch (error) {
        console.error("Failed to fetch organisations:", error);
      } finally {
        if (!cancelled) {
          setOrganisationsLoading(false);
        }
      }
    }

    void fetchOrganisations();

    return () => {
      cancelled = true;
    };
  }, [state.status]);

  // TODO: Wire up actual API callbacks for:
  // - onLinkUserPatient
  // - onUpdatePermissions
  // Note: User and patient creation now handled by dedicated pages (/admin/users/new, /admin/patients/new)

  return (
    <Admin
      platformRole={
        state.status === "authenticated"
          ? (state.user.platform_role as "superadmin" | "standard")
          : undefined
      }
      clinicalServicesEnabled={clinicalServicesEnabled}
      showPatients={managesPatients}
      existingUsers={users}
      patientCount={patientCount}
      usersLoading={usersLoading}
      patientsLoading={patientsLoading}
      organisationsLoading={organisationsLoading}
      organisationCount={organisationCount}
    />
  );
}
