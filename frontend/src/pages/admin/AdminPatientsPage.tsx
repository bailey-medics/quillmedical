/**
 * Admin Patients Page
 *
 * Displays all registered patient records in a table format.
 * Allows administrators to view patient demographics and navigate to patient admin pages.
 * Includes an "Add patient" button to create new patient records.
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
  Button,
  Group,
  Badge,
} from "@mantine/core";
import { IconAlertCircle, IconUserPlus } from "@tabler/icons-react";
import PageHeader from "@/components/page-header";
import StateMessage from "@/components/state-message";
import { api } from "@/lib/api";
import { FHIR_POLLING_TIME } from "@/lib/constants";

interface Patient {
  id: string;
  name: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
  is_active?: boolean;
}

interface PatientsApiResponse {
  patients: Patient[];
  fhir_ready: boolean;
}

/**
 * Admin Patients Page
 *
 * Main patient management interface showing all patient records.
 * Clicking on a patient navigates to their admin page.
 * Polls the API until FHIR is ready during initialisation.
 *
 * @returns Admin patients page component
 */
export default function AdminPatientsPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [fhirReady, setFhirReady] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPatients() {
      try {
        // Include inactive patients for admin view
        const data = await api.get<PatientsApiResponse>(
          "/patients?include_inactive=true",
        );

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
        <Group justify="space-between" align="flex-start">
          <PageHeader
            title="Patient management"
            description="View and manage all patient records"
            size="lg"
            mb={0}
          />
          <Button
            leftSection={<IconUserPlus size={16} />}
            onClick={() => navigate("/admin/patients/new")}
          >
            Add patient
          </Button>
        </Group>

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
                <Table.Th>Birth date</Table.Th>
                <Table.Th>Gender</Table.Th>
                <Table.Th>Patient ID</Table.Th>
                <Table.Th>Status</Table.Th>
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
                  <Table.Td>
                    <Badge
                      color={patient.is_active !== false ? "green" : "red"}
                      variant="light"
                      size="sm"
                    >
                      {patient.is_active !== false ? "Active" : "Deactivated"}
                    </Badge>
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
