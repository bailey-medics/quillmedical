/**
 * Patient Admin Page
 *
 * Administrative view for a single patient's non-clinical details.
 * Shows user linkage and patient demographics. Only accessible to admin/superadmin.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
} from "@mantine/core";
import { IconPencil, IconAlertCircle, IconUser } from "@tabler/icons-react";
import PageHeader from "@/components/page-header/PageHeader";
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
 *
 * @returns Patient admin page component
 */
export default function PatientAdminPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const [patient, setPatient] = useState<PatientResource | null>(null);
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
          <Title order={3} size="h4" mb="md">
            Patient details
          </Title>

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
      </Stack>
    </Container>
  );
}
