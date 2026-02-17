/**
 * Edit Patient Page
 *
 * Allows administrators to select and edit patient records.
 * Displays a list of patients to choose from for editing.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Stack,
  Table,
  Text,
  Skeleton,
  Center,
  Alert,
  ActionIcon,
} from "@mantine/core";
import { IconAlertCircle, IconEdit } from "@tabler/icons-react";
import PageHeader from "@/components/page-header/PageHeader";

interface Patient {
  id: string;
  name: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
}

/**
 * Edit Patient Page
 *
 * Displays all patients with edit action buttons.
 * Navigates to patient edit form when edit icon is clicked.
 *
 * @returns Edit patient page component
 */
export default function EditPatientPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleEditPatient = (patientId: string) => {
    navigate(`/admin/patients/${patientId}/edit`);
  };

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader
          title="Edit patient"
          description="Select a patient to edit their demographics and information"
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
                <Table.Th style={{ width: "100px", textAlign: "right" }}>
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
                    <ActionIcon
                      variant="light"
                      color="blue"
                      onClick={() => handleEditPatient(patient.id)}
                      aria-label="Edit patient"
                    >
                      <IconEdit size={18} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}
