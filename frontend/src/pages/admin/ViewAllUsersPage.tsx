/**
 * View All Users Page
 *
 * Displays a list of all registered users in the system.
 * Admin and superadmin users can view this list.
 */

import { useEffect, useState } from "react";
import {
  Container,
  Stack,
  Table,
  Text,
  Skeleton,
  Center,
  Alert,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
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

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader
          title="All users"
          description="View all registered user accounts"
          size="lg"
          mb={0}
        />

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
            icon={<IconAlertCircle size={16} />}
            title="Error loading users"
            color="red"
          >
            {error}
          </Alert>
        ) : users.length === 0 ? (
          <Center p="xl">
            <Text c="dimmed">No users found</Text>
          </Center>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Username</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>ID</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    <Text fw={500}>{user.username}</Text>
                  </Table.Td>
                  <Table.Td>{user.email}</Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {user.id}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}
