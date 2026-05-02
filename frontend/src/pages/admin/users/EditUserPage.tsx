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
  Skeleton,
  Center,
  Alert,
} from "@mantine/core";
import { IconAlertCircle, IconEdit } from "@tabler/icons-react";
import Icon from "@/components/icons";
import IconButton from "@/components/button/IconButton";
import { BodyTextBold, EmptyState } from "@/components/typography";
import PageHeader from "@/components/page-header";

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
        <PageHeader title="Edit user" />

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
                    <BodyTextBold>{user.username}</BodyTextBold>
                  </Table.Td>
                  <Table.Td>{user.email}</Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>
                    <IconButton
                      icon={<IconEdit />}
                      variant="light"
                      color="primary"
                      onClick={() => handleEditUser(user.id)}
                      aria-label={`Edit ${user.username}`}
                    />
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
