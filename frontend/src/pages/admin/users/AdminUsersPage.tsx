/**
 * Admin Users Page
 *
 * Displays all registered user accounts in a table format.
 * Allows administrators to view user details and navigate to user admin pages.
 * Includes an "Add user" button to create new user accounts.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Stack, Text, Group } from "@mantine/core";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import AdminTable, { type Column } from "@/components/tables/AdminTable";
import { api } from "@/lib/api";

interface User {
  id: number;
  username: string;
  email: string;
}

interface UsersApiResponse {
  users: User[];
}

/**
 * Admin Users Page
 *
 * Main user management interface showing all user accounts.
 * Clicking on a user navigates to their admin page.
 *
 * @returns Admin users page component
 */
export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const data = await api.get<UsersApiResponse>("/users");
        setUsers(data.users || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, []);

  const columns: Column<User>[] = [
    {
      header: "Username",
      render: (user) => (
        <Text fw={500} size="lg">
          {user.username}
        </Text>
      ),
    },
    {
      header: "Email",
      render: (user) => <Text size="lg">{user.email}</Text>,
    },
    {
      header: "User ID",
      render: (user) => (
        <Text size="lg" c="dimmed">
          {user.id}
        </Text>
      ),
    },
  ];

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <PageHeader
            title="User management"
            description="View and manage all user accounts"
            size="lg"
            mb={0}
          />
          <AddButton
            label="Add user"
            onClick={() => navigate("/admin/users/new")}
          />
        </Group>

        <AdminTable
          data={users}
          columns={columns}
          onRowClick={(user) => navigate(`/admin/users/${user.id}`)}
          getRowKey={(user) => user.id}
          loading={loading}
          error={error}
          emptyMessage="No users found"
        />
      </Stack>
    </Container>
  );
}
