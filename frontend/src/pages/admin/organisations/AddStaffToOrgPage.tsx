/**
 * Add Staff to Organisation Page
 *
 * Form for adding an existing user as a staff member of an organisation.
 * Fetches the list of users and allows selection via a searchable select.
 * Only accessible to admin/superadmin users.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Container, Stack, Alert } from "@mantine/core";
import { Controller } from "react-hook-form";
import { IconAlertCircle } from "@components/icons/appIcons";
import Icon from "@/components/icons";
import BaseCard from "@/components/base-card/BaseCard";
import SelectField from "@/components/form/SelectField";
import PageHeader from "@/components/page-header";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";

interface ApiUser {
  id: number;
  username: string;
  email: string;
}

interface AddStaffFormValues {
  userId: string | null;
}

function AddStaffFields({
  orgId,
  users,
  usersLoading,
}: {
  orgId: string;
  users: ApiUser[];
  usersLoading: boolean;
}) {
  const navigate = useNavigate();
  const { methods } = useFormContext();

  return (
    <Stack gap="md">
      <FormStatus />
      <BaseCard>
        <Stack gap="md">
          <Controller
            name="userId"
            control={methods.control}
            rules={{ required: "Please select a user" }}
            render={({ field, fieldState }) => (
              <SelectField
                label="User"
                placeholder="Search for a user"
                data={users.map((u) => ({
                  value: String(u.id),
                  label: `${u.username} (${u.email})`,
                }))}
                value={field.value as string | null}
                onChange={field.onChange}
                error={fieldState.error?.message}
                searchable
                disabled={usersLoading}
                withAsterisk
              />
            )}
          />

          <SubmitButton
            onCancel={() => navigate(`/admin/organisations/${orgId}`)}
            disabled={usersLoading}
          />
        </Stack>
      </BaseCard>
    </Stack>
  );
}

export default function AddStaffToOrgPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { reload } = useAuth();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const response = await api.get<{ users: ApiUser[] }>(
          "/users?permission_level=staff",
        );
        setUsers(response.users);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load users",
        );
      } finally {
        setUsersLoading(false);
      }
    }

    fetchUsers();
  }, []);

  async function handleSubmit(
    data: AddStaffFormValues,
  ): Promise<FormSubmitResult> {
    try {
      await api.post(`/organizations/${id}/staff`, {
        user_id: Number(data.userId),
      });
      await reload();
      navigate(`/admin/organisations/${id}`);
      return {
        state: "success",
        message: { title: "Staff member added" },
      };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Failed to add staff member",
          description:
            err instanceof Error ? err.message : "An unexpected error occurred",
        },
      };
    }
  }

  return (
    <Container size="lg">
      <Stack gap="lg">
        <PageHeader title="Add staff member" />

        {loadError && (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="lg" />}
            title="Error loading users"
            color="var(--alert-color)"
          >
            {loadError}
          </Alert>
        )}

        <Form<AddStaffFormValues>
          defaultValues={{ userId: null }}
          onSubmit={handleSubmit}
          submitLabel="Add staff member"
          submittingLabel="Adding…"
        >
          <AddStaffFields
            orgId={id!}
            users={users}
            usersLoading={usersLoading}
          />
        </Form>
      </Stack>
    </Container>
  );
}
