/**
 * Deactivate Patient Page
 *
 * Allows administrators to deactivate patient records.
 * Can be accessed in two ways:
 * 1. With patient ID in route params: /admin/patients/:patientId/deactivate
 * 2. Without patient ID: /admin/patients/deactivate (shows patient selection list)
 */

import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  Container,
  Stack,
  Button,
  Table,
  Skeleton,
  Center,
  Alert,
  Modal,
  Group,
} from "@mantine/core";
import { IconAlertCircle, IconUserMinus } from "@components/icons/appIcons";
import Icon from "@/components/icons";
import BaseCard from "@/components/base-card/BaseCard";
import ButtonPairRed from "@/components/button/ButtonPairRed";
import {
  BodyText,
  BodyTextInline,
  BodyTextBold,
  EmptyState,
} from "@/components/typography";
import { notifications } from "@mantine/notifications";
import PageHeader from "@/components/page-header";
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
 * Deactivate Patient Page
 *
 * Displays deactivation confirmation if patient ID provided in route/state,
 * otherwise shows a list of patients to select for deactivation.
 *
 * @returns Deactivate patient page component
 */
export default function DeactivatePatientPage() {
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
  const [deactivating, setDeactivating] = useState(false);

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

  const handleDeactivateClick = (patient: Patient) => {
    setSelectedPatient(patient);
  };

  const handleDeactivateConfirm = async () => {
    const patientToDeactivate = specificPatient || selectedPatient;
    if (!patientToDeactivate) return;

    setDeactivating(true);
    try {
      await api.post(`/patients/${patientToDeactivate.id}/deactivate`);

      notifications.show({
        title: "Patient deactivated",
        message: `${formatName(patientToDeactivate.name)} has been deactivated successfully`,
        color: "var(--success-color)",
      });

      // Navigate back to patient admin page or patients list
      if (patientId) {
        navigate(`/admin/patients/${patientId}`);
      } else {
        navigate("/admin/patients");
      }
    } catch (err) {
      notifications.show({
        title: "Deactivation failed",
        message:
          err instanceof Error ? err.message : "Failed to deactivate patient",
        color: "var(--alert-color)",
      });
    } finally {
      setDeactivating(false);
    }
  };

  // If we have a specific patient (from route params or state), show the deactivation confirmation
  if (specificPatient) {
    return (
      <Container size="lg" pt="xl">
        <Stack gap="lg">
          <PageHeader
            title={`Deactivate ${formatName(specificPatient.name)}`}
          />

          {loading ? (
            <Skeleton height={300} />
          ) : error ? (
            <Alert
              icon={<Icon icon={<IconAlertCircle />} size="sm" />}
              title="Error loading patient"
              color="var(--alert-color)"
            >
              {error}
            </Alert>
          ) : (
            <BaseCard>
              <Stack gap="md">
                <Alert
                  icon={<Icon icon={<IconAlertCircle />} size="sm" />}
                  title="Warning"
                  color="orange"
                >
                  You are about to deactivate this patient record. This will
                  restrict access to their records.
                </Alert>

                <Stack gap="xs">
                  <Group>
                    <BodyTextBold>Name:</BodyTextBold>
                    <BodyTextInline>
                      {formatName(specificPatient.name)}
                    </BodyTextInline>
                  </Group>
                  {specificPatient.birthDate && (
                    <Group>
                      <BodyTextBold>Birth date:</BodyTextBold>
                      <BodyTextInline>
                        {specificPatient.birthDate}
                      </BodyTextInline>
                    </Group>
                  )}
                  {specificPatient.gender && (
                    <Group>
                      <BodyTextBold>Gender:</BodyTextBold>
                      <BodyTextInline>{specificPatient.gender}</BodyTextInline>
                    </Group>
                  )}
                  <Group>
                    <BodyTextBold>Patient ID:</BodyTextBold>
                    <BodyText>{specificPatient.id}</BodyText>
                    <BodyText>{specificPatient.id}</BodyText>
                  </Group>
                </Stack>

                <ButtonPairRed
                  acceptLabel="Confirm deactivation"
                  acceptLoading={deactivating}
                  onAccept={handleDeactivateConfirm}
                  onCancel={() => window.history.back()}
                />
              </Stack>
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
        <PageHeader title="Deactivate patient" />

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
            color="var(--alert-color)"
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
                <Table.Th style={{ width: "150px", textAlign: "right" }}>
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
                    <Button
                      variant="light"
                      color="var(--alert-color)"
                      size="xs"
                      leftSection={<Icon icon={<IconUserMinus />} size="sm" />}
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
            <BodyTextInline>
              Are you sure you want to deactivate patient{" "}
              <strong>
                {selectedPatient ? formatName(selectedPatient.name) : ""}
              </strong>
              ?
            </BodyTextInline>
            <BodyText>
              This will restrict access to their records. This action can be
              reversed later.
            </BodyText>
            <ButtonPairRed
              acceptLabel="Deactivate patient"
              acceptLoading={deactivating}
              onAccept={handleDeactivateConfirm}
              onCancel={() => setSelectedPatient(null)}
            />
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}
