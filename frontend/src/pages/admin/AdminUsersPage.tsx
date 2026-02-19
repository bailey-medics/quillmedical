/**
 * Admin Users Page
 *
 * User management interface for administrators.
 * Provides actions for creating and editing user accounts.
 */

import { Container, SimpleGrid, Stack } from "@mantine/core";
import {
  IconUserPlus,
  IconUserEdit,
  IconUsers,
  IconUserMinus,
} from "@tabler/icons-react";
import ActionCard from "@/components/action-card";
import PageHeader from "@/components/page-header/PageHeader";
import Icon from "@/components/icons/Icon";

/**
 * Admin Users Page
 *
 * Interface for managing user accounts with options to:
 * - Create new users
 * - Edit existing users
 *
 * @returns Admin users page component
 */
export default function AdminUsersPage() {
  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader
          title="User management"
          description="Create and manage user accounts"
          size="lg"
          mb={0}
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <ActionCard
            icon={<Icon icon={<IconUsers />} size="lg" />}
            title="Show all users"
            subtitle="View and search all registered user accounts"
            buttonLabel="View all users"
            buttonUrl="/admin/users/list"
          />
          <ActionCard
            icon={<Icon icon={<IconUserPlus />} size="lg" />}
            title="Add user"
            subtitle="Create a new user account with competencies and permissions"
            buttonLabel="Add new user"
            buttonUrl="/admin/users/new"
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <ActionCard
            icon={<Icon icon={<IconUserEdit />} size="lg" />}
            title="Edit user"
            subtitle="Update user details, competencies, and permissions"
            buttonLabel="Edit user"
            buttonUrl="/admin/users/edit"
          />
          <ActionCard
            icon={<Icon icon={<IconUserMinus />} size="lg" />}
            title="Deactivate user"
            subtitle="Deactivate a user account and revoke access"
            buttonLabel="Deactivate user"
            buttonUrl="/admin/users/deactivate"
          />
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
