/**
 * View All Users Page
 *
 * Displays a list of all registered users in the system.
 * Admin and superadmin users can view this list.
 */

import { useEffect, useState } from "react";
import { Container, Stack, Skeleton, Center, Alert } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import Icon from "@/components/icons";
import { EmptyState } from "@/components/typography";
import DataTable, { type Column } from "@/components/tables/DataTable";
import PageHeader from "@/components/page-header";

interface User {
  id: string;
  username: string;
  email: string;
}

/**
 * View All Users Page
 *
 * Fetches and displays all users from the API.
 * Shows a table with user details.
 *
 * @returns View all users page component
 */
export default function ViewAllUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const response = await fetch("/api/users", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch users");
        }

        const data = await response.json();
        setUsers(data.users || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, []);

  const userColumns: Column<User>[] = [
    { header: "Username", render: (u) => u.username },
    { header: "Email", render: (u) => u.email },
    { header: "ID", render: (u) => u.id },
  ];

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader title="All users" />

        {loading ? (
          <Stack gap="xs">
            <Skeleton height={50} />
            <Skeleton height={50} />
            <Skeleton height={50} />
            <Skeleton height={50} />
            <Skeleton height={50} />
          </Stack>
        ) : error ? (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="sm" />}
            title="Error loading users"
            color="red"
          >
            {error}
          </Alert>
        ) : users.length === 0 ? (
          <Center p="xl">
            <EmptyState>No users found</EmptyState>
          </Center>
        ) : (
          <DataTable<User>
            data={users}
            columns={userColumns}
            getRowKey={(user) => user.id}
            emptyMessage="No users found"
          />
        )}
      </Stack>
    </Container>
  );
}
