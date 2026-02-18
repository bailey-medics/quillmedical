/**
 * View All Patients Page
 *
 * Displays all registered patient records in a table format.
 * Allows administrators to view patient demographics.
 */

import { useEffect, useState } from "react";
import {
  Container,
  Stack,
  Table,
  Text,
  Skeleton,
  Center,
  Alert,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import PageHeader from "@/components/page-header/PageHeader";

interface Patient {
  id: string;
  name: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
}

/**
 * View All Patients Page
 *
 * Fetches and displays all patient records from the FHIR server.
 *
 * @returns View all patients page component
 */
export default function ViewAllPatientsPage() {
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

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader
          title="All patients"
          description="View all registered patient records"
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
                <Table.Th>Patient ID</Table.Th>
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
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {patient.id}
                    </Text>
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
