/**
 * Admin Patients Page
 *
 * Displays all registered patient records in a table format.
 * Allows administrators to view patient demographics and navigate to patient admin pages.
 * Includes an "Add patient" button to create new patient records.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Stack, Center, Group } from "@mantine/core";
import PageHeader from "@/components/page-header";
import { StateMessage } from "@/components/message-cards";
import { IconClock } from "@/components/icons/appIcons";
import AddButton from "@/components/button/AddButton";
import DataTable, { type Column } from "@/components/tables/DataTable";
import NationalNumber from "@/components/data/NationalNumber";
import FormattedDate from "@/components/data/Date";
import ActiveStatusBadge from "@/components/badge/ActiveStatusBadge";
import { api } from "@/lib/api";
import { FHIR_POLLING_TIME } from "@/lib/constants";

interface Patient {
  id: string;
  name: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
  is_active?: boolean;
  identifier?: Array<{ system?: string; value?: string }>;
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
          "/patients?include_inactive=true&scope=admin",
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

  const columns: Column<Patient>[] = [
    {
      header: "Name",
      render: (patient) => formatName(patient.name),
    },
    {
      header: "Birth date",
      render: (patient) =>
        patient.birthDate ? (
          <FormattedDate date={patient.birthDate} locale="en-GB" />
        ) : (
          "N/A"
        ),
    },
    {
      header: "Gender",
      render: (patient) => patient.gender || "N/A",
    },
    {
      header: "NHS number",
      render: (patient) => {
        const nhsIdentifier = patient.identifier?.find(
          (id) =>
            id.system === "https://fhir.nhs.uk/Id/nhs-number" &&
            id.value !== "",
        );
        if (!nhsIdentifier) {
          return "N/A";
        }
        return (
          <NationalNumber
            nationalNumber={nhsIdentifier.value!}
            nationalNumberSystem={nhsIdentifier.system}
          />
        );
      },
    },
    {
      header: "Status",
      render: (patient) => (
        <ActiveStatusBadge active={patient.is_active !== false} />
      ),
    },
  ];

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <PageHeader title="Patient management" />
          <AddButton
            label="Add patient"
            onClick={() => navigate("/admin/patients/new")}
          />
        </Group>

        {fhirReady === false ? (
          <Center p="xl">
            <StateMessage
              icon={<IconClock />}
              title="Database is initialising"
              description="The Quill databases are just warming up. This may take a few moments. The patient list will appear automatically once available."
              colour="info"
            />
          </Center>
        ) : (
          <DataTable
            data={patients}
            columns={columns}
            onRowClick={(patient) => navigate(`/admin/patients/${patient.id}`)}
            getRowKey={(patient) => patient.id}
            loading={loading}
            error={error}
            emptyMessage="No patients found"
          />
        )}
      </Stack>
    </Container>
  );
}
