/**
 * Admin Users Page
 *
 * Displays all registered user accounts in a table format.
 * Allows administrators to view user details and navigate to user admin pages.
 * Includes an "Add user" button to create new user accounts.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Stack,
  Table,
  Text,
  Skeleton,
  Center,
  Alert,
  Button,
  Group,
} from "@mantine/core";
import { IconAlertCircle, IconUserPlus } from "@tabler/icons-react";
import PageHeader from "@/components/page-header";
import Icon from "@/components/icons";
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

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <PageHeader
            title="User management"
            description="View and manage all user accounts"
            size="lg"
            mb={0}
          />
          <Button
            leftSection={<Icon icon={<IconUserPlus />} size="sm" />}
            onClick={() => navigate("/admin/users/new")}
          >
            Add user
          </Button>
        </Group>

        {error ? (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="lg" />}
            title="Error loading users"
            color="red"
          >
            {error}
          </Alert>
        ) : loading ? (
          <Stack gap="xs">
            <Skeleton height={50} />
            <Skeleton height={50} />
            <Skeleton height={50} />
            <Skeleton height={50} />
          </Stack>
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
                <Table.Th>User ID</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((user) => (
                <Table.Tr
                  key={user.id}
                  onClick={() => navigate(`/admin/users/${user.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <Table.Td>
                    <Text fw={500}>{user.username}</Text>
                  </Table.Td>
                  <Table.Td>{user.email}</Table.Td>
                  <Table.Td>
                    <Text size="lg" c="dimmed">
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
