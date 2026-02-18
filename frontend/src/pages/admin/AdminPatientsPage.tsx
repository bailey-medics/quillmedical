/**
 * Admin Patients Page
 *
 * Patient management interface for administrators.
 * Provides actions for creating, editing patients and linking users to patients.
 */

import { Container, SimpleGrid, Stack } from "@mantine/core";
import {
  IconUserPlus,
  IconUserEdit,
  IconLink,
  IconUsers,
  IconUserMinus,
} from "@tabler/icons-react";
import ActionCard from "@/components/action-card";
import PageHeader from "@/components/page-header/PageHeader";
import StateMessage from "@/components/state-message/StateMessage";
import { useState } from "react";
import { Modal, Select, Button, Group } from "@mantine/core";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { FHIR_POLLING_TIME } from "@/lib/constants";
import { useEffect } from "react";

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
 * Admin Patients Page
 *
 * Interface for managing patient records with options to:
 * - Create new patients
 * - Edit existing patients
 * - Link users to patients
 *
 * @returns Admin patients page component
 */
export default function AdminPatientsPage() {
  const { state } = useAuth();
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [users, setUsers] = useState<
    Array<{ id: string; username: string; email: string }>
  >([]);
  const [patients, setPatients] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [linkForm, setLinkForm] = useState<{
    userId: string;
    patientId: string;
  }>({
    userId: "",
    patientId: "",
  });

  // Check FHIR readiness on page load
  useEffect(() => {
    let cancelled = false;

    async function checkFhirReady() {
      if (
        state.status !== "authenticated" ||
        !state.user.system_permissions ||
        !["admin", "superadmin"].includes(state.user.system_permissions)
      ) {
        setPatientsLoading(false);
        return;
      }

      try {
        const patientsResponse =
          await api.get<PatientsApiResponse>("/patients");

        if (!cancelled) {
          // Check if FHIR is ready
          if (patientsResponse.fhir_ready) {
            setPatientsLoading(false);
          } else {
            // FHIR not ready yet, retry
            setTimeout(() => {
              if (!cancelled) {
                checkFhirReady();
              }
            }, FHIR_POLLING_TIME);
          }
        }
      } catch (error) {
        console.error("Failed to check FHIR readiness:", error);
        // On error, retry
        setTimeout(() => {
          if (!cancelled) {
            checkFhirReady();
          }
        }, FHIR_POLLING_TIME);
      }
    }

    checkFhirReady();

    return () => {
      cancelled = true;
    };
  }, [state.status, state.user]);

  // Fetch users and patients for the link modal
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      if (
        state.status !== "authenticated" ||
        !state.user.system_permissions ||
        !["admin", "superadmin"].includes(state.user.system_permissions)
      ) {
        return;
      }

      try {
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
        console.error("Failed to fetch data:", error);
      }
    }

    if (linkModalOpen) {
      fetchData();
    }

    return () => {
      cancelled = true;
    };
  }, [linkModalOpen, state]);

  const handleLinkUserPatient = () => {
    // TODO: Wire up actual API callback
    console.log("Link user to patient:", linkForm);
    setLinkModalOpen(false);
    setLinkForm({ userId: "", patientId: "" });
  };

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader
          title="Patient management"
          description="Create and manage patient records"
          size="lg"
          mb={0}
        />

        {patientsLoading ? (
          <StateMessage type="database-initialising" />
        ) : (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <ActionCard
                icon={<IconUsers size={24} />}
                title="Show all patients"
                subtitle="View and search all registered patient records"
                buttonLabel="View all patients"
                buttonUrl="/admin/patients/list"
              />
              <ActionCard
                icon={<IconUserPlus size={24} />}
                title="Add patient"
                subtitle="Register a new patient record with demographics"
                buttonLabel="Add new patient"
                buttonUrl="/admin/patients/new"
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <ActionCard
                icon={<IconUserEdit size={24} />}
                title="Edit patient"
                subtitle="Modify patient demographics and information"
                buttonLabel="Edit patient"
                buttonUrl="/admin/patients/edit"
              />
              <ActionCard
                icon={<IconLink size={24} />}
                title="Link user and patient"
                subtitle="Associate a user account with a patient record"
                buttonLabel="Create link"
                buttonUrl="#"
                onClick={() => setLinkModalOpen(true)}
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <ActionCard
                icon={<IconUserMinus size={24} />}
                title="Deactivate patient"
                subtitle="Deactivate a patient record and restrict access"
                buttonLabel="Deactivate patient"
                buttonUrl="/admin/patients/deactivate"
              />
            </SimpleGrid>
          </>
        )}

        {/* Link User to Patient Modal */}
        <Modal
          opened={linkModalOpen}
          onClose={() => setLinkModalOpen(false)}
          title="Link user to patient"
          size="md"
          transitionProps={{ duration: 0 }}
          withinPortal={false}
        >
          <Stack gap="md">
            <Select
              label="Select user"
              placeholder="Choose user"
              data={users.map((u) => ({
                value: u.id,
                label: `${u.username} (${u.email})`,
              }))}
              value={linkForm.userId}
              onChange={(val) =>
                setLinkForm({ ...linkForm, userId: val || "" })
              }
              searchable
              required
            />
            <Select
              label="Select patient"
              placeholder="Choose patient"
              data={patients.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              value={linkForm.patientId}
              onChange={(val) =>
                setLinkForm({ ...linkForm, patientId: val || "" })
              }
              searchable
              required
            />
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={() => setLinkModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleLinkUserPatient}>Create link</Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}
