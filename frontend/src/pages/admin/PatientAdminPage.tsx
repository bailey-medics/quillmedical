/**
 * Patient Admin Page
 *
 * Administrative view for a single patient's non-clinical details.
 * Shows user linkage and patient demographics. Only accessible to admin/superadmin.
 * Provides action cards for editing and deactivating patients.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Container,
  Stack,
  Paper,
  Group,
  Text,
  Title,
  ActionIcon,
  Skeleton,
  Alert,
  Badge,
  SimpleGrid,
} from "@mantine/core";
import {
  IconPencil,
  IconAlertCircle,
  IconUser,
  IconUserEdit,
  IconUserMinus,
  IconUserCheck,
} from "@tabler/icons-react";
import PageHeader from "@/components/page-header/PageHeader";
import ActionCard from "@/components/action-card";
import { api } from "@/lib/api";

/**
 * Patient FHIR Resource (simplified)
 */
interface PatientResource {
  id: string;
  name: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
  identifier?: Array<{
    system?: string;
    value?: string;
  }>;
}

/**
 * User linked to patient
 */
interface LinkedUser {
  id: number;
  username: string;
  email: string;
}

/**
 * Patient Admin Page
 *
 * Displays administrative details for a single patient including:
 * - Linked user account (if any)
 * - Patient demographics (read-only)
 * - Patient activation status
 * - Action cards for editing and activating/deactivating
 *
 * @returns Patient admin page component
 */
export default function PatientAdminPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<PatientResource | null>(null);
  const [isActive, setIsActive] = useState<boolean>(true);
  // TODO: Wire up setLinkedUser when backend endpoint exists for fetching linked user
  const [linkedUser] = useState<LinkedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPatientData() {
      if (!patientId) {
        setError("No patient ID provided");
        setLoading(false);
        return;
      }

      try {
        // Fetch patient details
        const patientData = await api.get<PatientResource>(
          `/patients/${patientId}`,
        );
        setPatient(patientData);

        // Fetch patient metadata (including activation status)
        const metadata = await api.get<{
          patient_id: string;
          is_active: boolean;
        }>(`/patients/${patientId}/metadata`);
        setIsActive(metadata.is_active);

        // TODO: Fetch linked user when backend endpoint exists
        // const linkedUserData = await api.get<LinkedUser | null>(`/patients/${patientId}/linked-user`);
        // setLinkedUser(linkedUserData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchPatientData();
  }, [patientId]);

  const formatName = (
    nameArray: Array<{ given?: string[]; family?: string }> | undefined,
  ) => {
    if (!nameArray || nameArray.length === 0) return "Unknown";
    const name = nameArray[0];
    const givenName = name.given?.[0] || "";
    const familyName = name.family || "";
    return `${givenName} ${familyName}`.trim() || "Unknown";
  };

  const getNationalIdentifier = () => {
    if (!patient?.identifier) return null;
    // Look for UK NHS number
    const nhsIdentifier = patient.identifier.find(
      (id) =>
        id.system === "https://fhir.nhs.uk/Id/nhs-number" && id.value !== "",
    );
    if (nhsIdentifier) {
      return { label: "NHS Number", value: nhsIdentifier.value };
    }
    // Fallback to first identifier
    if (patient.identifier.length > 0 && patient.identifier[0].value) {
      return { label: "Patient ID", value: patient.identifier[0].value };
    }
    return null;
  };

  const handleEditLink = () => {
    // TODO: Open modal or navigate to edit link page
    console.log("Edit user-patient link for patient:", patientId);
  };

  if (loading) {
    return (
      <Container size="lg" pt="xl">
        <Stack gap="lg">
          <Skeleton height={60} />
          <Skeleton height={200} />
          <Skeleton height={300} />
        </Stack>
      </Container>
    );
  }

  if (error || !patient) {
    return (
      <Container size="lg" pt="xl">
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Error loading patient"
          color="red"
        >
          {error || "Patient not found"}
        </Alert>
      </Container>
    );
  }

  const patientName = formatName(patient.name);
  const nationalId = getNationalIdentifier();

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader
          title={patientName}
          description="Patient administrative details"
          size="lg"
          mb={0}
        />

        {/* Linked User Section */}
        <Paper shadow="sm" p="md" withBorder>
          <Group justify="space-between" mb="md">
            <Title order={3} size="h4">
              Linked user account
            </Title>
            <ActionIcon
              variant="subtle"
              color="blue"
              onClick={handleEditLink}
              aria-label="Edit linked user"
            >
              <IconPencil size={18} />
            </ActionIcon>
          </Group>

          {linkedUser ? (
            <Stack gap="xs">
              <Group gap="xs">
                <IconUser size={16} />
                <Text fw={500}>{linkedUser.username}</Text>
              </Group>
              <Text size="sm" c="dimmed">
                {linkedUser.email}
              </Text>
              <Badge color="green" variant="light" size="sm" w="fit-content">
                Linked
              </Badge>
            </Stack>
          ) : (
            <Alert icon={<IconAlertCircle size={16} />} color="gray">
              No user account linked to this patient
            </Alert>
          )}
        </Paper>

        {/* Patient Details Section */}
        <Paper shadow="sm" p="md" withBorder>
          <Group justify="space-between" mb="md">
            <Title order={3} size="h4">
              Patient details
            </Title>
            <Badge color={isActive ? "green" : "red"} variant="light">
              {isActive ? "Active" : "Deactivated"}
            </Badge>
          </Group>

          <Stack gap="md">
            <Group justify="space-between">
              <Text c="dimmed" size="sm">
                Full name
              </Text>
              <Text fw={500}>{patientName}</Text>
            </Group>

            {patient.birthDate && (
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  Date of birth
                </Text>
                <Text fw={500}>{patient.birthDate}</Text>
              </Group>
            )}

            {patient.gender && (
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  Gender
                </Text>
                <Text fw={500} style={{ textTransform: "capitalize" }}>
                  {patient.gender}
                </Text>
              </Group>
            )}

            {nationalId && (
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {nationalId.label}
                </Text>
                <Text fw={500} ff="monospace">
                  {nationalId.value}
                </Text>
              </Group>
            )}

            <Group justify="space-between">
              <Text c="dimmed" size="sm">
                Patient ID
              </Text>
              <Text fw={500} ff="monospace" size="sm">
                {patient.id}
              </Text>
            </Group>
          </Stack>
        </Paper>

        {/* Patient Actions Section */}
        <Stack gap="md">
          <Title order={3} size="h4">
            Patient actions
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <ActionCard
              icon={<IconUserEdit size={24} />}
              title="Edit patient"
              subtitle="Modify patient demographics and information"
              buttonLabel="Edit patient"
              buttonUrl={`/admin/patients/${patientId}/edit`}
              onClick={() => {
                // Navigate to edit page for this specific patient
                navigate(`/admin/patients/${patientId}/edit`, {
                  state: { patient },
                });
              }}
            />
            {isActive ? (
              <ActionCard
                icon={<IconUserMinus size={24} />}
                title="Deactivate patient"
                subtitle="Deactivate this patient record"
                buttonLabel="Deactivate patient"
                buttonUrl={`/admin/patients/${patientId}/deactivate`}
                onClick={() => {
                  // Navigate to deactivate page for this specific patient
                  navigate(`/admin/patients/${patientId}/deactivate`, {
                    state: { patient },
                  });
                }}
              />
            ) : (
              <ActionCard
                icon={<IconUserCheck size={24} />}
                title="Activate patient"
                subtitle="Reactivate this patient record"
                buttonLabel="Activate patient"
                buttonUrl={`/admin/patients/${patientId}/activate`}
                onClick={async () => {
                  try {
                    await api.post(`/patients/${patientId}/activate`);
                    // Refresh the page to show updated status
                    window.location.reload();
                  } catch (err) {
                    console.error("Failed to activate patient:", err);
                  }
                }}
              />
            )}
          </SimpleGrid>
        </Stack>
      </Stack>
    </Container>
  );
}
