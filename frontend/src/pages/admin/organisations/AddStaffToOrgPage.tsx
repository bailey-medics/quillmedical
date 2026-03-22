/**
 * Add Staff to Organisation Page
 *
 * Form for adding an existing user as a staff member of an organisation.
 * Fetches the list of users and allows selection via a searchable select.
 * Only accessible to admin/superadmin users.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Container,
  Stack,
  Paper,
  Select,
  Button,
  Group,
  Alert,
} from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import Icon from "@/components/icons";
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
  const [success, setSuccess] = useState(false);
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
      setSuccess(true);
      setTimeout(() => navigate(`/admin/organisations/${id}`), 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add staff member",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Container size="lg" py="xl">
        <Alert
          icon={<Icon icon={<IconCheck />} size="lg" />}
          title="Staff member added"
          color="green"
        >
          Redirecting to organisation...
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader
          title="Add staff member"
          description="Add a user as a staff member of this organisation"
          size="lg"
        />

        {error && (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="lg" />}
            title="Error"
            color="red"
          >
            {error}
          </Alert>
        )}

        <Paper withBorder p="xl">
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <Select
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

              <Group justify="flex-end" mt="md">
                <Button
                  variant="default"
                  onClick={() => navigate(`/admin/organisations/${id}`)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={submitting}
                  disabled={usersLoading}
                >
                  Add staff member
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
