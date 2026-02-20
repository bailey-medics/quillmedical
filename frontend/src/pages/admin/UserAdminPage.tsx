/**
 * User Admin Page
 *
 * Administrative view for a single user's details.
 * Shows user account information, CBAC settings, and system permissions.
 * Only accessible to admin/superadmin.
 * Provides action cards for editing and managing users.
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
} from "@mantine/core";
import PermissionBadge from "@/components/badge/PermissionBadge";
import {
  IconPencil,
  IconAlertCircle,
  IconUserMinus,
  IconShieldCheck,
} from "@tabler/icons-react";
import PageHeader from "@/components/page-header";
import Icon from "@/components/icons";
import ActionCard from "@/components/action-card";
import { api } from "@/lib/api";

/**
 * User details from API
 */
interface UserDetails {
  id: number;
  username: string;
  email: string;
  name: string;
  base_profession: string | null;
  additional_competencies: string[];
  removed_competencies: string[];
  system_permissions: "superadmin" | "admin" | "staff";
}

/**
 * User Admin Page
 *
 * Displays administrative details for a single user including:
 * - Account information (username, email)
 * - CBAC settings (base profession, competencies)
 * - System permissions level
 * - Action cards for editing and managing the user
 *
 * @returns User admin page component
 */
export default function UserAdminPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUserData() {
      if (!id) {
        setError("No user ID provided");
        setLoading(false);
        return;
      }

      try {
        const userData = await api.get<UserDetails>(`/users/${id}`);
        setUser(userData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
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

  if (error || !user) {
    return (
      <Container size="lg" py="xl">
        <Alert
          icon={<Icon icon={<IconAlertCircle />} size="lg" />}
          title="Error loading user"
          color="red"
        >
          {error || "User not found"}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      {" "}
      <Stack gap="lg">
        <PageHeader
          title={`User: ${user.username}`}
          description="View and manage user account"
          size="lg"
        />

        {/* Account Information */}
        <Paper shadow="sm" p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={2} size="lg">
                Account information
              </Title>
              <PermissionBadge
                permission={user.system_permissions}
                variant="light"
              />
            </Group>

            <Stack gap="xs">
              <Group gap="xs">
                <Text fw={500} size="lg">
                  Username:
                </Text>
                <Text size="lg">{user.username}</Text>
              </Group>

              <Group gap="xs">
                <Text fw={500} size="lg">
                  Email:
                </Text>
                <Text size="lg">{user.email}</Text>
              </Group>

              <Group gap="xs">
                <Text fw={500} size="lg">
                  User ID:
                </Text>
                <Text size="lg" c="dimmed">
                  {user.id}
                </Text>
              </Group>
            </Stack>
          </Stack>
        </Paper>

        {/* CBAC Settings */}
        <Paper shadow="sm" p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Title order={2} size="lg">
              CBAC settings
            </Title>

            <Stack gap="xs">
              <Group gap="xs">
                <Text fw={500} size="lg">
                  Base profession:
                </Text>
                <Text size="lg">{user.base_profession || "Not set"}</Text>
              </Group>

              {user.additional_competencies.length > 0 && (
                <Stack gap="xs">
                  <Text fw={500} size="lg">
                    Additional competencies:
                  </Text>
                  <Group gap="xs">
                    {user.additional_competencies.map((comp) => (
                      <Badge key={comp} variant="light" color="teal">
                        {comp}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
              )}

              {user.removed_competencies.length > 0 && (
                <Stack gap="xs">
                  <Text fw={500} size="lg">
                    Removed competencies:
                  </Text>
                  <Group gap="xs">
                    {user.removed_competencies.map((comp) => (
                      <Badge key={comp} variant="light" color="red">
                        {comp}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
              )}

              {!user.base_profession &&
                user.additional_competencies.length === 0 &&
                user.removed_competencies.length === 0 && (
                  <Text size="lg" c="dimmed">
                    No CBAC settings configured
                  </Text>
                )}
            </Stack>
          </Stack>
        </Paper>

        {/* Action Cards */}
        <Stack gap="md">
          <Title order={2} size="lg">
            Actions
          </Title>

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <ActionCard
              icon={<IconPencil />}
              onClick={() => navigate(`/admin/users/${id}/edit`)}
              title="Edit user"
              subtitle="Modify user account and permissions"
              buttonLabel="Edit"
            />

            <ActionCard
              icon={<IconShieldCheck />}
              onClick={() => navigate(`/admin/users/edit`)}
              title="Update permissions"
              subtitle="Configure CBAC and system permissions"
              buttonLabel="Configure"
            />

            <ActionCard
              icon={<IconUserMinus />}
              onClick={() => navigate(`/admin/users/deactivate`)}
              title="Deactivate user"
              subtitle="Disable this user account"
              buttonLabel="Deactivate"
            />
          </SimpleGrid>
        </Stack>
      </Stack>
    </Container>
  );
}
