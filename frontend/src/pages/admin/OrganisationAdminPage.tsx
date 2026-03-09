/**
 * Organisation Admin Page
 *
 * Administrative view for a single organisation's details.
 * Shows organisation information, staff members, and patient count.
 * Only accessible to admin/superadmin.
 * Provides action cards for editing and managing organisations.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Container,
  Stack,
  Paper,
  Group,
  SimpleGrid,
  Text,
  Title,
  Skeleton,
  Alert,
  Badge,
  Table,
} from "@mantine/core";
import { IconPencil, IconAlertCircle, IconUsers } from "@tabler/icons-react";
import PageHeader from "@/components/page-header";
import Icon from "@/components/icons";
import ActionCard from "@/components/action-card";
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
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrganizationData() {
      if (!id) {
        setError("No organisation ID provided");
        setLoading(false);
        return;
      }

      try {
        const orgData = await api.get<OrganizationDetails>(
          `/organizations/${id}`,
        );
        setOrg(orgData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchOrganizationData();
  }, [id]);

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
            <Title order={2} size="lg">
              Organisation information
            </Title>

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
        {org.staff_members.length > 0 && (
          <Paper shadow="sm" p="lg" radius="md" withBorder>
            <Stack gap="md">
              <Title order={2} size="lg">
                Staff members
              </Title>

              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Username</Table.Th>
                    <Table.Th>Email</Table.Th>
                    <Table.Th>Primary</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {org.staff_members.map((member) => (
                    <Table.Tr
                      key={member.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/admin/users/${member.id}`)}
                    >
                      <Table.Td>
                        <Text fw={500}>{member.username}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text>{member.email}</Text>
                      </Table.Td>
                      <Table.Td>
                        {member.is_primary && (
                          <Badge color="blue" variant="light">
                            Primary
                          </Badge>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Paper>
        )}

        {/* Action Cards */}
        <Stack gap="md">
          <Title order={2} size="lg">
            Actions
          </Title>

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <ActionCard
              icon={<IconPencil />}
              onClick={() => navigate(`/admin/organisations/${id}/edit`)}
              title="Edit organisation"
              subtitle="Modify organisation details"
              buttonLabel="Edit"
            />

            <ActionCard
              icon={<IconUsers />}
              onClick={() => navigate(`/admin/organisations/${id}/staff`)}
              title="Manage staff"
              subtitle="Add or remove staff members"
              buttonLabel="Manage"
            />
          </SimpleGrid>
        </Stack>
      </Stack>
    </Container>
  );
}
