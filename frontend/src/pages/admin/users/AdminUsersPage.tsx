/**
 * Admin Users Page
 *
 * Displays all registered user accounts in a table format.
 * Allows administrators to view user details and navigate to user admin pages.
 * Includes an "Add user" button to create new user accounts.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Stack, Group } from "@mantine/core";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import DataTable, { type Column } from "@/components/tables/DataTable";
import ActiveStatusBadge from "@/components/badge/ActiveStatusBadge";
import PermissionBadge from "@/components/badge/PermissionBadge";
import { useSearchFilter } from "@lib/search";
import { api } from "@/lib/api";

interface User {
  id: number;
  username: string;
  email: string;
  system_permissions:
    | "superadmin"
    | "admin"
    | "staff"
    | "teaching_delegate"
    | "patient";
  is_active: boolean;
  organisations: string[];
  sites: string[];
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

  const getSearchText = useCallback(
    (user: User) =>
      [
        user.username,
        ...user.organisations,
        ...user.sites,
        user.system_permissions,
      ].join(" "),
    [],
  );
  const filteredUsers = useSearchFilter(users, getSearchText);

  const columns: Column<User>[] = [
    {
      header: "Username",
      render: (user) => user.username,
      accessor: (user) => user.username,
    },
    {
      header: "Organisation/site",
      render: (user) => {
        if (!user.organisations.length && !user.sites.length) return "—";
        const org = user.organisations.join(", ");
        const site = user.sites.join(", ");
        if (org && site) return `${org} – ${site}`;
        return org || site;
      },
      accessor: (user) =>
        [...user.organisations, ...user.sites].join(", ") || "",
    },
    {
      header: "Permission",
      render: (user) => (
        <PermissionBadge permission={user.system_permissions} />
      ),
      accessor: (user) => user.system_permissions,
    },
    {
      header: "Status",
      render: (user) => <ActiveStatusBadge active={user.is_active} />,
      accessor: (user) => (user.is_active ? "active" : "inactive"),
    },
  ];

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <PageHeader title="Users" />
          <AddButton
            label="Add user"
            onClick={() => navigate("/admin/users/new")}
          />
        </Group>

        <DataTable
          data={filteredUsers}
          columns={columns}
          onRowClick={(user) => navigate(`/admin/users/${user.id}`)}
          getRowKey={(user) => user.id}
          pageSize={10}
          fullControls
          loading={loading}
          error={error}
          emptyMessage="No users found"
        />
      </Stack>
    </Container>
  );
}
