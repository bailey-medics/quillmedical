/**
 * Deactivate Patient Page
 *
 * Allows administrators to select and deactivate patient records.
 * Displays a list of patients to choose from for deactivation.
 */

import { useEffect, useState } from "react";
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
} from "@mantine/core";
import { IconAlertCircle, IconUserMinus } from "@tabler/icons-react";
import PageHeader from "@/components/page-header/PageHeader";

interface Patient {
  id: string;
  name: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
}

/**
 * Deactivate Patient Page
 *
 * Displays all patients and allows selecting one to deactivate.
 * Shows a confirmation modal before deactivating.
 *
 * @returns Deactivate patient page component
 */
export default function DeactivatePatientPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    async function fetchPatients() {
      try {
        const response = await fetch("/api/patients", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch patients");
        }

        const data = await response.json();
        setPatients(data.patients || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchPatients();
  }, []);

  const formatName = (
    nameArray: Array<{ given?: string[]; family?: string }>,
  ) => {
    if (!nameArray || nameArray.length === 0) return "Unknown";
    const name = nameArray[0];
    const givenName = name.given?.[0] || "";
    const familyName = name.family || "";
    return `${givenName} ${familyName}`.trim() || "Unknown";
  };

  const handleDeactivateClick = (patient: Patient) => {
    setSelectedPatient(patient);
  };

  const handleDeactivateConfirm = async () => {
    if (!selectedPatient) return;

    setDeactivating(true);
    try {
      // TODO: Implement API call to deactivate patient
      // const response = await fetch(`/api/patients/${selectedPatient.id}/deactivate`, {
      //   method: 'POST',
      //   credentials: 'include',
      // });
      // if (!response.ok) throw new Error('Failed to deactivate patient');

      // For now, just close the modal and show success
      alert(
        `Patient ${formatName(selectedPatient.name)} would be deactivated (API not yet implemented)`,
      );

      setSelectedPatient(null);
      // Refresh patient list
      // fetchPatients();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to deactivate patient",
      );
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader
          title="Deactivate patient"
          description="Select a patient to deactivate their record and restrict access"
          size="lg"
          mb={0}
        />

        {loading ? (
          <Stack gap="xs">
            <Skeleton height={50} />
            <Skeleton height={50} />
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
          <Center p="xl">
            <Text c="dimmed">No patients found</Text>
          </Center>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Birth Date</Table.Th>
                <Table.Th>Gender</Table.Th>
                <Table.Th style={{ width: "150px", textAlign: "right" }}>
                  Action
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {patients.map((patient) => (
                <Table.Tr key={patient.id}>
                  <Table.Td>
                    <Text fw={500}>{formatName(patient.name)}</Text>
                  </Table.Td>
                  <Table.Td>{patient.birthDate || "N/A"}</Table.Td>
                  <Table.Td>{patient.gender || "N/A"}</Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>
                    <Button
                      variant="light"
                      color="red"
                      size="xs"
                      leftSection={<IconUserMinus size={16} />}
                      onClick={() => handleDeactivateClick(patient)}
                    >
                      Deactivate
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Modal
          opened={selectedPatient !== null}
          onClose={() => setSelectedPatient(null)}
          title="Confirm deactivation"
          centered
        >
          <Stack gap="md">
            <Text>
              Are you sure you want to deactivate patient{" "}
              <strong>
                {selectedPatient ? formatName(selectedPatient.name) : ""}
              </strong>
              ?
            </Text>
            <Text size="sm" c="dimmed">
              This will restrict access to their records. This action can be
              reversed later.
            </Text>
            <Stack gap="sm">
              <Button
                color="red"
                onClick={handleDeactivateConfirm}
                loading={deactivating}
                leftSection={<IconUserMinus size={18} />}
              >
                Deactivate patient
              </Button>
              <Button
                variant="light"
                onClick={() => setSelectedPatient(null)}
                disabled={deactivating}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}
