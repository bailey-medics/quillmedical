/**
 * Edit Patient Page
 *
 * Allows administrators to edit patient records.
 * Can be accessed in two ways:
 * 1. With patient ID in route params: /admin/patients/:patientId/edit
 * 2. Without patient ID: /admin/patients/edit (shows patient selection list)
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  Container,
  Stack,
  Table,
  Skeleton,
  Center,
  Alert,
} from "@mantine/core";
import { IconAlertCircle, IconEdit } from "@components/icons/appIcons";
import Icon from "@/components/icons";
import IconButton from "@/components/button/IconButton";
import BaseCard from "@/components/base-card/BaseCard";
import {
  BodyText,
  BodyTextBold,
  Heading,
  EmptyState,
} from "@/components/typography";
import PageHeader from "@/components/page-header";

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
 * Edit Patient Page
 *
 * Displays patient edit form if patient ID provided in route/state,
 * otherwise shows a list of patients to select for editing.
 *
 * @returns Edit patient page component
 */
export default function EditPatientPage() {
  const navigate = useNavigate();
  const { patientId } = useParams<{ patientId: string }>();
  const location = useLocation();
  const locationState = location.state as LocationState | null;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(
    locationState?.patient || null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // If we have a patient ID but no patient data, fetch it
        if (patientId && !selectedPatient) {
          const response = await fetch(`/api/patients/${patientId}`, {
            credentials: "include",
          });

          if (!response.ok) {
            throw new Error("Failed to fetch patient");
          }

          const patientData = await response.json();
          setSelectedPatient(patientData);
        } else if (!patientId) {
          // No patient ID, fetch all patients for selection
          const response = await fetch("/api/patients", {
            credentials: "include",
          });

          if (!response.ok) {
            throw new Error("Failed to fetch patients");
          }

          const data = await response.json();
          setPatients(data.patients || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [patientId, selectedPatient]);

  const formatName = (
    nameArray: Array<{ given?: string[]; family?: string }>,
  ) => {
    if (!nameArray || nameArray.length === 0) return "Unknown";
    const name = nameArray[0];
    const givenName = name.given?.[0] || "";
    const familyName = name.family || "";
    return `${givenName} ${familyName}`.trim() || "Unknown";
  };

  const handleEditPatient = (id: string) => {
    navigate(`/admin/patients/${id}/edit`);
  };

  // If we have a selected patient (from route params or state), show the edit form
  if (selectedPatient) {
    return (
      <Container size="lg" pt="xl">
        <Stack gap="lg">
          <PageHeader title={`Edit ${formatName(selectedPatient.name)}`} />

          {loading ? (
            <Skeleton height={400} />
          ) : error ? (
            <Alert
              icon={<Icon icon={<IconAlertCircle />} size="sm" />}
              title="Error loading patient"
              color="red"
            >
              {error}
            </Alert>
          ) : (
            <BaseCard>
              <Heading>TODO: Patient edit form</Heading>
              <BodyText>
                Patient edit functionality is not yet implemented. This page
                will contain a form to edit patient demographics including name,
                birth date, gender, and identifiers.
              </BodyText>
            </BaseCard>
          )}
        </Stack>
      </Container>
    );
  }

  // Otherwise, show the patient selection list
  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader title="Edit patient" />

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
            icon={<Icon icon={<IconAlertCircle />} size="sm" />}
            title="Error loading patients"
            color="red"
          >
            {error}
          </Alert>
        ) : patients.length === 0 ? (
          <Center p="xl">
            <EmptyState>No patients found</EmptyState>
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
                    <BodyTextBold>{formatName(patient.name)}</BodyTextBold>
                  </Table.Td>
                  <Table.Td>{patient.birthDate || "N/A"}</Table.Td>
                  <Table.Td>{patient.gender || "N/A"}</Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>
                    <IconButton
                      icon={<IconEdit />}
                      variant="light"
                      color="primary"
                      onClick={() => handleEditPatient(patient.id)}
                      aria-label="Edit patient"
                    />
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
