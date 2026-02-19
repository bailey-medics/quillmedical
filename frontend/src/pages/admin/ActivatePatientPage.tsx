/**
 * Activate Patient Page
 *
 * Allows administrators to activate deactivated patient records.
 * Can be accessed in two ways:
 * 1. With patient ID in route params: /admin/patients/:patientId/activate
 * 2. Without patient ID: /admin/patients/activate (shows patient selection list)
 */

import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  Container,
  Stack,
  Button,
  Table,
  Text,
  Skeleton,
  Center,
  Alert,
  Modal,
  Paper,
  Group,
} from "@mantine/core";
import { IconAlertCircle, IconUserCheck } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import PageHeader from "@/components/page-header/PageHeader";
import { api } from "@/lib/api";

interface Patient {
  id: string;
  name: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
}

interface LocationState {
  patient?: Patient;
}

/**
 * Activate Patient Page
 *
 * Displays activation confirmation if patient ID provided in route/state,
 * otherwise shows a list of deactivated patients to select for activation.
 *
 * @returns Activate patient page component
 */
export default function ActivatePatientPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as LocationState | null;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [specificPatient, setSpecificPatient] = useState<Patient | null>(
    locationState?.patient || null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        // If we have a patient ID but no patient data, fetch it
        if (patientId && !specificPatient) {
          const response = await fetch(`/api/patients/${patientId}`, {
            credentials: "include",
          });

          if (!response.ok) {
            throw new Error("Failed to fetch patient");
          }

          const patientData = await response.json();
          setSpecificPatient(patientData);
        } else if (!patientId) {
          // No patient ID, fetch deactivated patients for selection
          const response = await fetch("/api/patients?include_inactive=true", {
            credentials: "include",
          });

          if (!response.ok) {
            throw new Error("Failed to fetch patients");
          }

          const data = await response.json();
          // Filter for only deactivated patients
          const deactivatedPatients = (data.patients || []).filter(
            (p: Patient & { is_active?: boolean }) => p.is_active === false,
          );
          setPatients(deactivatedPatients);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [patientId, specificPatient]);

  const formatName = (
    nameArray: Array<{ given?: string[]; family?: string }>,
  ) => {
    if (!nameArray || nameArray.length === 0) return "Unknown";
    const name = nameArray[0];
    const givenName = name.given?.[0] || "";
    const familyName = name.family || "";
    return `${givenName} ${familyName}`.trim() || "Unknown";
  };

  const handleActivateClick = (patient: Patient) => {
    setSelectedPatient(patient);
  };

  const handleActivateConfirm = async () => {
    const patientToActivate = specificPatient || selectedPatient;
    if (!patientToActivate) return;

    setActivating(true);
    try {
      await api.post(`/patients/${patientToActivate.id}/activate`);

      notifications.show({
        title: "Patient activated",
        message: `${formatName(patientToActivate.name)} has been activated successfully`,
        color: "green",
      });

      // Navigate back to patient admin page or patients list
      if (patientId) {
        navigate(`/admin/patients/${patientId}`);
      } else {
        navigate("/admin/patients");
      }
    } catch (err) {
      notifications.show({
        title: "Activation failed",
        message:
          err instanceof Error ? err.message : "Failed to activate patient",
        color: "red",
      });
    } finally {
      setActivating(false);
    }
  };

  // If we have a specific patient (from route params or state), show the activation confirmation
  if (specificPatient) {
    return (
      <Container size="lg" pt="xl">
        <Stack gap="lg">
          <PageHeader
            title={`Activate ${formatName(specificPatient.name)}`}
            description="Confirm activation of this patient record"
            size="lg"
            mb={0}
          />

          {loading ? (
            <Skeleton height={300} />
          ) : error ? (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Error loading patient"
              color="red"
            >
              {error}
            </Alert>
          ) : (
            <Paper shadow="sm" p="md" withBorder>
              <Stack gap="md">
                <Alert
                  icon={<IconAlertCircle size={16} />}
                  title="Confirmation"
                  color="blue"
                >
                  You are about to activate this patient record. This will
                  restore access to their records.
                </Alert>

                <Stack gap="xs">
                  <Group>
                    <Text fw={500}>Name:</Text>
                    <Text>{formatName(specificPatient.name)}</Text>
                  </Group>
                  {specificPatient.birthDate && (
                    <Group>
                      <Text fw={500}>Birth date:</Text>
                      <Text>{specificPatient.birthDate}</Text>
                    </Group>
                  )}
                  {specificPatient.gender && (
                    <Group>
                      <Text fw={500}>Gender:</Text>
                      <Text style={{ textTransform: "capitalize" }}>
                        {specificPatient.gender}
                      </Text>
                    </Group>
                  )}
                  <Group>
                    <Text fw={500}>Patient ID:</Text>
                    <Text ff="monospace">{specificPatient.id}</Text>
                  </Group>
                </Stack>

                <Group justify="flex-end">
                  <Button
                    variant="subtle"
                    onClick={() => {
                      if (patientId) {
                        navigate(`/admin/patients/${patientId}`);
                      } else {
                        navigate("/admin/patients");
                      }
                    }}
                    disabled={activating}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="green"
                    leftSection={<IconUserCheck size={16} />}
                    onClick={handleActivateConfirm}
                    loading={activating}
                  >
                    Activate patient
                  </Button>
                </Group>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Container>
    );
  }

  // Otherwise, show patient selection list
  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader
          title="Activate patient"
          description="Select a deactivated patient to activate"
          size="lg"
          mb={0}
        />

        {loading ? (
          <Stack gap="xs">
            <Skeleton height={50} />
            <Skeleton height={50} />
            <Skeleton height={50} />
          </Stack>
        ) : error ? (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Error loading patients"
            color="red"
          >
            {error}
          </Alert>
        ) : patients.length === 0 ? (
          <Center h={300}>
            <Stack align="center" gap="xs">
              <IconUserCheck size={48} color="gray" />
              <Text c="dimmed">No deactivated patients found</Text>
            </Stack>
          </Center>
        ) : (
          <>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Birth date</Table.Th>
                  <Table.Th>Gender</Table.Th>
                  <Table.Th>Patient ID</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {patients.map((patient) => (
                  <Table.Tr key={patient.id}>
                    <Table.Td>{formatName(patient.name)}</Table.Td>
                    <Table.Td>{patient.birthDate || "N/A"}</Table.Td>
                    <Table.Td style={{ textTransform: "capitalize" }}>
                      {patient.gender || "N/A"}
                    </Table.Td>
                    <Table.Td ff="monospace">{patient.id}</Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        color="green"
                        variant="light"
                        onClick={() => handleActivateClick(patient)}
                      >
                        Activate
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Modal
              opened={!!selectedPatient}
              onClose={() => setSelectedPatient(null)}
              title="Confirm activation"
            >
              {selectedPatient && (
                <Stack gap="md">
                  <Text>
                    Are you sure you want to activate{" "}
                    <strong>{formatName(selectedPatient.name)}</strong>?
                  </Text>
                  <Group justify="flex-end">
                    <Button
                      variant="subtle"
                      onClick={() => setSelectedPatient(null)}
                      disabled={activating}
                    >
                      Cancel
                    </Button>
                    <Button
                      color="green"
                      onClick={handleActivateConfirm}
                      loading={activating}
                    >
                      Confirm
                    </Button>
                  </Group>
                </Stack>
              )}
            </Modal>
          </>
        )}
      </Stack>
    </Container>
  );
}
