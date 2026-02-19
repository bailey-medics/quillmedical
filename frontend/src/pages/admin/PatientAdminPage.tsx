/**
 * Patient Admin Page
 *
 * Administrative view for a single patient's non-clinical details.
 * Shows user linkage and patient demographics. Only accessible to admin/superadmin.
 * Provides action cards for editing and deactivating patients.
 */

import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import {
  Container,
  Stack,
  Paper,
  Group,
  Text,
  Title,
  Skeleton,
  Alert,
  Badge,
} from "@mantine/core";
import {
  IconPencil,
  IconAlertCircle,
  IconUser,
  IconUserMinus,
  IconUserCheck,
} from "@tabler/icons-react";
import PageHeader from "@/components/page-header/PageHeader";
import Icon from "@/components/icons/Icon";
import IconButton from "@/components/icon-button";
import ActionCard from "@/components/action-card";
import { api } from "@/lib/api";
import type { Patient } from "@/domains/patient";
import type { LayoutCtx } from "@/RootLayout";

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
  const context = useOutletContext<LayoutCtx | null>();
  // Provide no-op fallback for tests/contexts without outlet
  const setPatient = useMemo(
    () => context?.setPatient ?? (() => {}),
    [context],
  );
  const [patient, setLocalPatient] = useState<PatientResource | null>(null);
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
        setLocalPatient(patientData);

        // Fetch patient metadata (including activation status)
        const metadata = await api.get<{
          patient_id: string;
          is_active: boolean;
        }>(`/patients/${patientId}/metadata`);
        setIsActive(metadata.is_active);

        // Transform patient data for ribbon display
        // Extract name from FHIR structure
        let displayName = patientData.id;
        if (patientData.name && patientData.name.length > 0) {
          const primaryName = patientData.name[0];
          const givenNames = primaryName.given || [];
          const familyName = primaryName.family || "";
          const nameParts = [...givenNames, familyName].filter(Boolean);
          if (nameParts.length > 0) {
            displayName = nameParts.join(" ");
          }
        }

        // Extract national health identifier from identifiers
        let nationalNumber: string | undefined;
        let nationalNumberSystem: string | undefined;
        if (patientData.identifier && patientData.identifier.length > 0) {
          // Try to find a national health identifier
          const nationalIdentifier = patientData.identifier.find(
            (identifier) =>
              identifier.system === "https://fhir.nhs.uk/Id/nhs-number" ||
              identifier.system ===
                "http://ns.electronichealth.net.au/id/medicare-number" ||
              identifier.system?.includes("/national") ||
              identifier.system?.includes("/health-id"),
          );
          if (nationalIdentifier) {
            nationalNumber = nationalIdentifier.value;
            nationalNumberSystem = nationalIdentifier.system;
          }
        }

        // Calculate age from birthDate
        let age: number | undefined;
        if (patientData.birthDate) {
          const birthDate = new Date(patientData.birthDate);
          const today = new Date();
          age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < birthDate.getDate())
          ) {
            age--;
          }
        }

        // Update ribbon with patient details
        const ribbonPatient: Patient = {
          id: patientData.id,
          name: displayName,
          dob: patientData.birthDate ?? undefined,
          age: age,
          sex: patientData.gender ?? undefined,
          nationalNumber: nationalNumber,
          nationalNumberSystem: nationalNumberSystem,
        };
        setPatient(ribbonPatient);

        // TODO: Fetch linked user when backend endpoint exists
        // const linkedUserData = await api.get<LinkedUser | null>(`/patients/${patientId}/linked-user`);
        // setLinkedUser(linkedUserData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setPatient(null);
      } finally {
        setLoading(false);
      }
    }

    fetchPatientData();

    // Clean up: remove patient from ribbon when unmounting
    return () => {
      setPatient(null);
    };
  }, [patientId, setPatient]);

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
          icon={<Icon icon={<IconAlertCircle />} size="lg" />}
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
            <IconButton
              icon={<IconPencil />}
              size="md"
              variant="subtle"
              color="blue"
              onClick={handleEditLink}
              aria-label="Edit linked user"
            />
          </Group>

          {linkedUser ? (
            <Stack gap="xs">
              <Group gap="xs">
                <Icon icon={<IconUser />} size="lg" />
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
            <Alert
              icon={<Icon icon={<IconAlertCircle />} size="lg" />}
              color="gray"
            >
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
            <Group gap="xs">
              <Badge color={isActive ? "green" : "red"} variant="light">
                {isActive ? "Active" : "Deactivated"}
              </Badge>
              <IconButton
                icon={<IconPencil />}
                size="md"
                variant="subtle"
                aria-label="Edit patient details"
                onClick={() => {
                  navigate(`/admin/patients/${patientId}/edit`, {
                    state: { patient },
                  });
                }}
              />
            </Group>
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
                Patient system ID
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
          {isActive ? (
            <ActionCard
              icon={<Icon icon={<IconUserMinus />} size="lg" />}
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
              icon={<Icon icon={<IconUserCheck />} size="lg" />}
              title="Activate patient"
              subtitle="Reactivate this patient record"
              buttonLabel="Activate patient"
              buttonUrl={`/admin/patients/${patientId}/activate`}
              onClick={() => {
                // Navigate to activate page for this specific patient
                navigate(`/admin/patients/${patientId}/activate`, {
                  state: { patient },
                });
              }}
            />
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
