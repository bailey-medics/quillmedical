/**
 * View All Patients Page
 *
 * Displays all registered patient records in a table format.
 * Allows administrators to view patient demographics and navigate to patient admin pages.
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
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import PageHeader from "@/components/page-header";
import StateMessage from "@/components/state-message";
import { api } from "@/lib/api";
import { FHIR_POLLING_TIME } from "@/lib/constants";

interface Patient {
  id: string;
  name: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
}

interface PatientsApiResponse {
  patients: Patient[];
  fhir_ready: boolean;
}

/**
 * View All Patients Page
 *
 * Fetches and displays all patient records from the FHIR server.
 * Clicking on a patient navigates to their admin page.
 * Polls the API until FHIR is ready during initialization.
 *
 * @returns View all patients page component
 */
export default function ViewAllPatientsPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [fhirReady, setFhirReady] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPatients() {
      try {
        const data = await api.get<PatientsApiResponse>("/patients");

        if (cancelled) return;

        // Always stop loading after first response
        setLoading(false);

        // Check if FHIR is ready
        if (data.fhir_ready) {
          setPatients(data.patients || []);
          setFhirReady(true);
        } else {
          // FHIR not ready yet, show "database initialising" and retry
          setFhirReady(false);
          setTimeout(() => {
            if (!cancelled) {
              fetchPatients();
            }
          }, FHIR_POLLING_TIME);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      }
    }

    fetchPatients();

    return () => {
      cancelled = true;
    };
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

        {error ? (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Error loading patients"
            color="red"
          >
            {error}
          </Alert>
        ) : loading ? (
          <Stack gap="xs">
            <Skeleton height={50} />
            <Skeleton height={50} />
            <Skeleton height={50} />
            <Skeleton height={50} />
          </Stack>
        ) : fhirReady === false ? (
          <Center p="xl">
            <StateMessage type="database-initialising" />
          </Center>
        ) : patients.length === 0 ? (
          <Center p="xl">
            <StateMessage type="no-patients" />
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
                <Table.Tr
                  key={patient.id}
                  onClick={() => navigate(`/admin/patients/${patient.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <Table.Td>
                    <Text fw={500}>{formatName(patient.name)}</Text>
                  </Table.Td>
                  <Table.Td>{patient.birthDate || "N/A"}</Table.Td>
                  <Table.Td>{patient.gender || "N/A"}</Table.Td>
                  <Table.Td>
                    <Text size="lg" c="dimmed">
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
