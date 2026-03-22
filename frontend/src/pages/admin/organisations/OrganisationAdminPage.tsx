/**
 * Organisation Admin Page
 *
 * Administrative view for a single organisation's details.
 * Shows organisation information, staff members, and patient count.
 * Only accessible to admin/superadmin.
 * Provides action cards for editing and managing organisations.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ActionIcon,
  Container,
  Stack,
  Paper,
  Group,
  Text,
  Title,
  Skeleton,
  Alert,
  Badge,
  Menu,
  Modal,
  Button,
} from "@mantine/core";
import {
  IconPencil,
  IconAlertCircle,
  IconDots,
  IconUserMinus,
} from "@tabler/icons-react";
import PageHeader from "@/components/page-header";
import Icon from "@/components/icons";
import IconButton from "@/components/button/IconButton";
import AdminTable, { type Column } from "@/components/tables/AdminTable";
import AddButton from "@/components/button/AddButton";
import { api } from "@/lib/api";

/**
 * Staff member in organisation
 */
interface StaffMember {
  id: number;
  username: string;
  email: string;
  is_primary: boolean;
}

/**
 * Patient member in organisation
 */
interface PatientMember {
  patient_id: string;
  is_primary: boolean;
}

/**
 * Organisation details from API
 */
interface OrganizationDetails {
  id: number;
  name: string;
  type: string;
  location: string | null;
  created_at: string;
  updated_at: string;
  staff_count: number;
  patient_count: number;
  staff_members: StaffMember[];
  patient_members: PatientMember[];
}

interface FeatureOut {
  feature_key: string;
  enabled_at: string;
  enabled_by: number | null;
}

/** Labels for known feature keys */
const FEATURE_LABELS: Record<string, string> = {
  teaching: "Teaching",
  messaging: "Messaging",
  letters: "Letters",
};

/**
 * Organisation Admin Page
 *
 * Displays administrative details for a single organisation including:
 * - Basic information (name, type, location)
 * - Staff members list
 * - Patient count
 * - Action cards for editing and managing the organisation
 *
 * @returns Organisation admin page component
 */
export default function OrganisationAdminPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [org, setOrg] = useState<OrganizationDetails | null>(null);
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<StaffMember | null>(
    null,
  );

  const fetchOrganizationData = useCallback(async () => {
    if (!id) {
      setError("No organisation ID provided");
      setLoading(false);
      return;
    }

    try {
      const [orgData, featuresData] = await Promise.all([
        api.get<OrganizationDetails>(`/organizations/${id}`),
        api.get<{ features: FeatureOut[] }>(`/organizations/${id}/features`),
      ]);
      setOrg(orgData);
      setEnabledFeatures(featuresData.features.map((f) => f.feature_key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrganizationData();
  }, [fetchOrganizationData]);

  async function confirmRemoveStaff() {
    if (!id || !removingMember) return;
    try {
      await api.del(`/organizations/${id}/staff/${removingMember.id}`);
      setRemovingMember(null);
      await fetchOrganizationData();
    } catch {
      setRemovingMember(null);
    }
  }

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={60} />
          <Skeleton height={200} />
          <Skeleton height={150} />
        </Stack>
      </Container>
    );
  }

  if (error || !org) {
    return (
      <Container size="lg" py="xl">
        <Alert
          icon={<Icon icon={<IconAlertCircle />} size="lg" />}
          title="Error loading organisation"
          color="red"
        >
          {error || "Organisation not found"}
        </Alert>
      </Container>
    );
  }

  const formatType = (type: string): string => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const staffColumns: Column<StaffMember>[] = [
    { header: "Username", render: (member) => member.username },
    { header: "Email", render: (member) => member.email },
    {
      header: "Primary",
      render: (member) =>
        member.is_primary ? (
          <Badge color="blue" variant="light">
            Primary
          </Badge>
        ) : null,
    },
    {
      header: "",
      width: "50px",
      render: (member) => (
        <Menu position="bottom-end" shadow="md">
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Actions for ${member.username}`}
            >
              <Icon icon={<IconDots />} size="sm" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              color="red"
              leftSection={<Icon icon={<IconUserMinus />} size="sm" />}
              onClick={(e) => {
                e.stopPropagation();
                setRemovingMember(member);
              }}
            >
              Remove from organisation
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      ),
    },
  ];

  const patientColumns: Column<PatientMember>[] = [
    { header: "Patient ID", render: (patient) => patient.patient_id },
    {
      header: "Primary",
      render: (patient) =>
        patient.is_primary ? (
          <Badge color="blue" variant="light">
            Primary
          </Badge>
        ) : null,
    },
  ];

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader
          title={org.name}
          description="View and manage organisation details"
          size="lg"
        />

        {/* Organisation Information */}
        <Paper shadow="sm" p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={2} size="lg">
                Organisation information
              </Title>
              <IconButton
                icon={<IconPencil />}
                onClick={() => navigate(`/admin/organisations/${id}/edit`)}
                aria-label="Edit organisation"
              />
            </Group>

            <Stack gap="xs">
              <Group gap="xs">
                <Text fw={500} size="lg">
                  Name:
                </Text>
                <Text size="lg">{org.name}</Text>
              </Group>

              <Group gap="xs">
                <Text fw={500} size="lg">
                  Type:
                </Text>
                <Text size="lg">{formatType(org.type)}</Text>
              </Group>

              <Group gap="xs">
                <Text fw={500} size="lg">
                  Location:
                </Text>
                <Text size="lg">{org.location || "Not specified"}</Text>
              </Group>

              <Group gap="xs">
                <Text fw={500} size="lg">
                  Organisation ID:
                </Text>
                <Text size="lg" c="dimmed">
                  {org.id}
                </Text>
              </Group>
            </Stack>
          </Stack>
        </Paper>

        {/* Statistics */}
        <Paper shadow="sm" p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Title order={2} size="lg">
              Statistics
            </Title>

            <Group gap="xl">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Staff members
                </Text>
                <Text size="xl" fw={700}>
                  {org.staff_count}
                </Text>
              </Stack>

              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Patients
                </Text>
                <Text size="xl" fw={700}>
                  {org.patient_count}
                </Text>
              </Stack>
            </Group>
          </Stack>
        </Paper>

        {/* Staff Members */}
        <Paper shadow="sm" p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={2} size="lg">
                Staff members
              </Title>
              <AddButton
                label="Add staff member"
                onClick={() => navigate(`/admin/organisations/${id}/add-staff`)}
              />
            </Group>

            <AdminTable<StaffMember>
              data={org.staff_members}
              columns={staffColumns}
              onRowClick={(member) => navigate(`/admin/users/${member.id}`)}
              getRowKey={(member) => member.id}
              emptyMessage="No staff members assigned"
            />
          </Stack>
        </Paper>

        {/* Patient Members */}
        <Paper shadow="sm" p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={2} size="lg">
                Patients
              </Title>
              <AddButton
                label="Add patient"
                onClick={() =>
                  navigate(`/admin/organisations/${id}/add-patient`)
                }
              />
            </Group>

            <AdminTable<PatientMember>
              data={org.patient_members}
              columns={patientColumns}
              onRowClick={(patient) =>
                navigate(`/admin/patients/${patient.patient_id}`)
              }
              getRowKey={(patient) => patient.patient_id}
              emptyMessage="No patients assigned"
            />
          </Stack>
        </Paper>

        {/* Enabled Features */}
        <Paper shadow="sm" p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={2} size="lg">
                Enabled features
              </Title>
              <IconButton
                icon={<IconPencil />}
                onClick={() => navigate(`/admin/organisations/${id}/features`)}
                aria-label="Edit features"
              />
            </Group>

            {enabledFeatures.length > 0 ? (
              <Group gap="sm">
                {enabledFeatures.map((key) => (
                  <Badge key={key} variant="light" color="blue" size="lg">
                    {FEATURE_LABELS[key] ?? key}
                  </Badge>
                ))}
              </Group>
            ) : (
              <Text c="dimmed">No features enabled</Text>
            )}
          </Stack>
        </Paper>

        <Modal
          opened={removingMember !== null}
          onClose={() => setRemovingMember(null)}
          title="Remove staff member"
          centered
        >
          <Stack gap="md">
            <Text>
              Are you sure you want to remove{" "}
              <Text span fw={700}>
                {removingMember?.username}
              </Text>{" "}
              from this organisation?
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRemovingMember(null)}>
                Cancel
              </Button>
              <Button color="red" onClick={confirmRemoveStaff}>
                Remove
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}
