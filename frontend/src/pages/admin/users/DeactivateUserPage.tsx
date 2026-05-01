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
  Skeleton,
  Center,
  Alert,
  Modal,
} from "@mantine/core";
import { IconAlertCircle, IconUserMinus } from "@tabler/icons-react";
import Icon from "@/components/icons";
import {
  BodyText,
  BodyTextInline,
  BodyTextBold,
  PlaceholderText,
} from "@/components/typography";
import PageHeader from "@/components/page-header";

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
        <PageHeader title="Deactivate user" />

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
            <PlaceholderText>No users found</PlaceholderText>
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
                    <BodyTextBold>{user.username}</BodyTextBold>
                  </Table.Td>
                  <Table.Td>{user.email}</Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>
                    <Button
                      variant="light"
                      color="red"
                      size="xs"
                      leftSection={<Icon icon={<IconUserMinus />} size="sm" />}
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
            <BodyTextInline>
              Are you sure you want to deactivate user{" "}
              <strong>{selectedUser?.username}</strong>?
            </BodyTextInline>
            <BodyText>
              This will revoke their access to the system. This action can be
              reversed later.
            </BodyText>
            <Stack gap="sm">
              <Button
                color="red"
                onClick={handleDeactivateConfirm}
                loading={deactivating}
                leftSection={<Icon icon={<IconUserMinus />} size="sm" />}
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
