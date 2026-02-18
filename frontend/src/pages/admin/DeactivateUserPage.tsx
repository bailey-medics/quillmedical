/**
 * Deactivate User Page
 *
 * Allows administrators to select and deactivate user accounts.
 * Displays a list of users to choose from for deactivation.
 */

import { useEffect, useState } from "react";
import {
  Container,
  Stack,
  Button,
  Table,
  Text,
  Skeleton,
  Center,
  Alert,
  Modal,
} from "@mantine/core";
import { IconAlertCircle, IconUserMinus } from "@tabler/icons-react";
import PageHeader from "@/components/page-header/PageHeader";

interface User {
  id: string;
  username: string;
  email: string;
}

/**
 * Deactivate User Page
 *
 * Displays all users and allows selecting one to deactivate.
 * Shows a confirmation modal before deactivating.
 *
 * @returns Deactivate user page component
 */
export default function DeactivateUserPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState(false);

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

  const handleDeactivateClick = (user: User) => {
    setSelectedUser(user);
  };

  const handleDeactivateConfirm = async () => {
    if (!selectedUser) return;

    setDeactivating(true);
    try {
      // TODO: Implement API call to deactivate user
      // const response = await fetch(`/api/users/${selectedUser.id}/deactivate`, {
      //   method: 'POST',
      //   credentials: 'include',
      // });
      // if (!response.ok) throw new Error('Failed to deactivate user');

      // For now, just close the modal and show success
      alert(
        `User ${selectedUser.username} would be deactivated (API not yet implemented)`,
      );

      setSelectedUser(null);
      // Refresh user list
      // fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to deactivate user");
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader
          title="Deactivate user"
          description="Select a user to deactivate their account and revoke access"
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
                <Table.Th style={{ width: "150px", textAlign: "right" }}>
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
                    <Button
                      variant="light"
                      color="red"
                      size="xs"
                      leftSection={<IconUserMinus size={16} />}
                      onClick={() => handleDeactivateClick(user)}
                    >
                      Deactivate
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Modal
          opened={selectedUser !== null}
          onClose={() => setSelectedUser(null)}
          title="Confirm deactivation"
          centered
        >
          <Stack gap="md">
            <Text>
              Are you sure you want to deactivate user{" "}
              <strong>{selectedUser?.username}</strong>?
            </Text>
            <Text size="sm" c="dimmed">
              This will revoke their access to the system. This action can be
              reversed later.
            </Text>
            <Stack gap="sm">
              <Button
                color="red"
                onClick={handleDeactivateConfirm}
                loading={deactivating}
                leftSection={<IconUserMinus size={18} />}
              >
                Deactivate user
              </Button>
              <Button
                variant="light"
                onClick={() => setSelectedUser(null)}
                disabled={deactivating}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}
