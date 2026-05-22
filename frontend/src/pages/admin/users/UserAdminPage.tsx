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
} from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import {
  BodyText,
  BodyTextInline,
  BodyTextBold,
  Heading,
} from "@/components/typography";
import PermissionBadge from "@/components/badge/PermissionBadge";
import CompetencyBadge from "@/components/badge/CompetencyBadge";
import {
  IconPencil,
  IconAlertCircle,
  IconUserMinus,
  IconUserPlus,
  IconMail,
} from "@components/icons/appIcons";
import PageHeader from "@/components/page-header";
import Icon from "@/components/icons";
import ActionCard from "@/components/action-card";
import { ConfirmModal } from "@/components/confirm-modal";
import { api } from "@/lib/api";
import competenciesData from "@/generated/competencies.json";
import baseProfessionsData from "@/generated/base-professions.json";

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
  system_permissions:
    | "superadmin"
    | "admin"
    | "staff"
    | "teaching_delegate"
    | "patient";
  is_active: boolean;
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
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

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
      <Container size="lg">
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
      <Container size="lg">
        <Alert
          icon={<Icon icon={<IconAlertCircle />} size="lg" />}
          title="Error loading user"
          color="var(--alert-color)"
        >
          {error || "User not found"}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg">
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
                <BodyTextBold>Full name:</BodyTextBold>
                <BodyTextInline>{user.name}</BodyTextInline>
              </Group>

              <Group gap="xs">
                <BodyTextBold>Username:</BodyTextBold>
                <BodyTextInline>{user.username}</BodyTextInline>
              </Group>

              <Group gap="xs">
                <BodyTextBold>Email:</BodyTextBold>
                <BodyTextInline>{user.email}</BodyTextInline>
              </Group>
            </Stack>
          </Stack>
        </BaseCard>

        {/* CBAC Settings */}
        <BaseCard>
          <Stack gap="md">
            <Heading>Competency based access control (CBAC) settings</Heading>

            <Stack gap="xs">
              <Group gap="xs">
                <BodyTextBold>Base profession:</BodyTextBold>
                <BodyTextInline>
                  {user.base_profession
                    ? (baseProfessionsData.base_professions.find(
                        (p) => p.id === user.base_profession,
                      )?.display_name ?? user.base_profession)
                    : "Not set"}
                </BodyTextInline>
              </Group>

              {user.additional_competencies.length > 0 && (
                <Stack gap="xs">
                  <BodyTextBold>Additional competencies:</BodyTextBold>
                  <Group gap="xs">
                    {user.additional_competencies.map((comp) => (
                      <CompetencyBadge
                        key={comp}
                        label={
                          competenciesData.competencies.find(
                            (c) => c.id === comp,
                          )?.display_name || comp
                        }
                      />
                    ))}
                  </Group>
                </Stack>
              )}

              {user.removed_competencies.length > 0 && (
                <Stack gap="xs">
                  <BodyTextBold>Removed competencies:</BodyTextBold>
                  <Group gap="xs">
                    {user.removed_competencies.map((comp) => (
                      <CompetencyBadge
                        key={comp}
                        label={
                          competenciesData.competencies.find(
                            (c) => c.id === comp,
                          )?.display_name || comp
                        }
                        removed
                      />
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
              icon={<IconMail />}
              onClick={async () => {
                setInviteSending(true);
                try {
                  await api.post(`/users/${id}/send-invite`, {});
                  setInviteSent(true);
                } finally {
                  setInviteSending(false);
                }
              }}
              title="Send invite email"
              subtitle="Email the user a link to set up their credentials"
              buttonLabel={
                inviteSent ? "Sent" : inviteSending ? "Sending…" : "Send"
              }
              disabled={inviteSending || inviteSent}
            />

            <ActionCard
              icon={user.is_active ? <IconUserMinus /> : <IconUserPlus />}
              onClick={() => setDeactivateOpen(true)}
              title={user.is_active ? "Deactivate user" : "Reactivate user"}
              subtitle={
                user.is_active
                  ? "Disable this user account"
                  : "Re-enable this user account"
              }
              buttonLabel={user.is_active ? "Deactivate" : "Reactivate"}
            />
          </SimpleGrid>
        </Stack>

        <ConfirmModal
          opened={deactivateOpen}
          onClose={() => setDeactivateOpen(false)}
          onAccept={async () => {
            const action = user.is_active ? "deactivate" : "reactivate";
            await api.post(`/users/${id}/${action}`, {});
            navigate("/admin/users");
          }}
          title={user.is_active ? "Deactivate user" : "Reactivate user"}
          acceptLabel={user.is_active ? "Deactivate user" : "Reactivate user"}
          submittingLabel={user.is_active ? "Deactivating…" : "Reactivating…"}
          icon={user.is_active ? <IconUserMinus /> : <IconUserPlus />}
        >
          {user.is_active ? (
            <>
              Are you sure you want to deactivate{" "}
              <strong>{user.username}</strong>? They will no longer be able to
              log in. This action can be reversed later.
            </>
          ) : (
            <>
              Are you sure you want to reactivate{" "}
              <strong>{user.username}</strong>? They will be able to log in
              again.
            </>
          )}
        </ConfirmModal>
      </Stack>
    </Container>
  );
}
