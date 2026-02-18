/**
 * Edit User Page
 *
 * Allows administrators to select and edit user accounts.
 * Displays a list of users to choose from for editing.
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
  ActionIcon,
} from "@mantine/core";
import { IconAlertCircle, IconEdit } from "@tabler/icons-react";
import PageHeader from "@/components/page-header/PageHeader";

interface User {
  id: string;
  username: string;
  email: string;
}

/**
 * Edit User Page
 *
 * Displays all users and allows selecting one to edit.
 * Clicking on a user navigates to the edit form.
 *
 * @returns Edit user selection page component
 */
export default function EditUserPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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

  const handleEditUser = (userId: string) => {
    // Navigate to edit form for specific user
    navigate(`/admin/users/${userId}/edit`);
  };

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader
          title="Edit user"
          description="Select a user to edit their details, competencies, and permissions"
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
                <Table.Th style={{ width: "100px", textAlign: "right" }}>
                  Action
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    <Text fw={500}>{user.username}</Text>
                  </Table.Td>
                  <Table.Td>{user.email}</Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>
                    <ActionIcon
                      variant="light"
                      color="blue"
                      onClick={() => handleEditUser(user.id)}
                      aria-label={`Edit ${user.username}`}
                    >
                      <IconEdit size={18} />
                    </ActionIcon>
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
