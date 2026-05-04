/**
 * View All Patients Page
 *
 * Displays all registered patient records in a table format.
 * Allows administrators to view patient demographics and navigate to patient admin pages.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Stack, Skeleton, Center, Alert } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import Icon from "@/components/icons";
import DataTable, { type Column } from "@/components/tables/DataTable";
import PageHeader from "@/components/page-header";
import { StateMessage } from "@/components/message-cards";
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
        const data = await api.get<PatientsApiResponse>(
          "/patients?scope=admin",
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

  const patientColumns: Column<Patient>[] = [
    { header: "Name", render: (p) => formatName(p.name) },
    { header: "Birth date", render: (p) => p.birthDate || "N/A" },
    { header: "Gender", render: (p) => p.gender || "N/A" },
    { header: "Patient ID", render: (p) => p.id },
  ];

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader title="All patients" />

        {error ? (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="sm" />}
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
          <DataTable<Patient>
            data={patients}
            columns={patientColumns}
            onRowClick={(patient) => navigate(`/admin/patients/${patient.id}`)}
            getRowKey={(patient) => patient.id}
            emptyMessage="No patients found"
          />
        )}
      </Stack>
    </Container>
  );
}
