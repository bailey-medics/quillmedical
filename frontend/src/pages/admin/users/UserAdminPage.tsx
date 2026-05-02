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
  Group,
  SimpleGrid,
  Skeleton,
  Alert,
  Badge,
} from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import {
  BodyText,
  BodyTextInline,
  BodyTextBold,
  Heading,
} from "@/components/typography";
import PermissionBadge from "@/components/badge/PermissionBadge";
import {
  IconPencil,
  IconAlertCircle,
  IconUserMinus,
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
        <PageHeader title={`User: ${user.username}`} />

        {/* Account Information */}
        <BaseCard>
          <Stack gap="md">
            <Group justify="space-between">
              <Heading>Account information</Heading>
              <PermissionBadge permission={user.system_permissions} />
            </Group>

            <Stack gap="xs">
              <Group gap="xs">
                <BodyTextBold>Username:</BodyTextBold>
                <BodyTextInline>{user.username}</BodyTextInline>
              </Group>

              <Group gap="xs">
                <BodyTextBold>Email:</BodyTextBold>
                <BodyTextInline>{user.email}</BodyTextInline>
              </Group>

              <Group gap="xs">
                <BodyTextBold>User ID:</BodyTextBold>
                <BodyText>{user.id}</BodyText>
              </Group>
            </Stack>
          </Stack>
        </BaseCard>

        {/* CBAC Settings */}
        <BaseCard>
          <Stack gap="md">
            <Heading>CBAC settings</Heading>

            <Stack gap="xs">
              <Group gap="xs">
                <BodyTextBold>Base profession:</BodyTextBold>
                <BodyTextInline>
                  {user.base_profession || "Not set"}
                </BodyTextInline>
              </Group>

              {user.additional_competencies.length > 0 && (
                <Stack gap="xs">
                  <BodyTextBold>Additional competencies:</BodyTextBold>
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
                  <BodyTextBold>Removed competencies:</BodyTextBold>
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
                  <BodyText>No CBAC settings configured</BodyText>
                )}
            </Stack>
          </Stack>
        </BaseCard>

        {/* Action Cards */}
        <Stack gap="md">
          <Heading>Actions</Heading>

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <ActionCard
              icon={<IconPencil />}
              onClick={() => navigate(`/admin/users/${id}/edit`)}
              title="Edit user"
              subtitle="Modify user account and permissions"
              buttonLabel="Edit"
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
