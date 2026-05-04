/**
 * Add Staff to Organisation Page
 *
 * Form for adding an existing user as a staff member of an organisation.
 * Fetches the list of users and allows selection via a searchable select.
 * Only accessible to admin/superadmin users.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Container, Stack, Alert } from "@mantine/core";
import { IconAlertCircle } from "@components/icons/appIcons";
import Icon from "@/components/icons";
import BaseCard from "@/components/base-card/BaseCard";
import ButtonPair from "@/components/button/ButtonPair";
import SelectField from "@/components/form/SelectField";
import PageHeader from "@/components/page-header";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";

interface ApiUser {
  id: number;
  username: string;
  email: string;
}

export default function AddStaffToOrgPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { reload } = useAuth();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const response = await api.get<{ users: ApiUser[] }>(
          "/users?permission_level=staff",
        );
        setUsers(response.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users");
      } finally {
        setUsersLoading(false);
      }
    }

    fetchUsers();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSelectError(null);

    if (!selectedUserId) {
      setSelectError("Please select a user");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.post(`/organizations/${id}/staff`, {
        user_id: Number(selectedUserId),
      });
      await reload();
      navigate(`/admin/organisations/${id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add staff member",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Add staff member" />

        {error && (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="lg" />}
            title="Error"
            color="red"
          >
            {error}
          </Alert>
        )}

        <BaseCard>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <SelectField
                label="User"
                placeholder="Search for a user"
                data={users.map((u) => ({
                  value: String(u.id),
                  label: `${u.username} (${u.email})`,
                }))}
                value={selectedUserId}
                onChange={setSelectedUserId}
                error={selectError}
                searchable
                disabled={usersLoading}
                withAsterisk
              />

              <ButtonPair
                acceptLabel="Add staff member"
                acceptType="submit"
                acceptLoading={submitting}
                acceptDisabled={usersLoading}
                onAccept={() => {}}
                onCancel={() => navigate(`/admin/organisations/${id}`)}
              />
            </Stack>
          </form>
        </BaseCard>
      </Stack>
    </Container>
  );
}
