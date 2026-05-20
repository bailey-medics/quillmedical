/**
 * Add Staff to Site Page
 *
 * Form for adding a staff member to a site with a role.
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

const ROLE_OPTIONS = [
  { value: "clinical_lead", label: "Clinical lead" },
  { value: "staff", label: "Staff" },
  { value: "trainee", label: "Trainee" },
];

interface ApiUser {
  id: number;
  username: string;
  email: string;
}

interface AddStaffFormValues {
  userId: string | null;
  role: string | null;
}

function AddStaffFields({
  siteId,
  users,
  usersLoading,
}: {
  siteId: string;
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

          <Controller
            name="role"
            control={methods.control}
            rules={{ required: "Please select a role" }}
            render={({ field, fieldState }) => (
              <SelectField
                label="Role"
                placeholder="Select a role"
                data={ROLE_OPTIONS}
                value={field.value as string | null}
                onChange={field.onChange}
                error={fieldState.error?.message}
                withAsterisk
              />
            )}
          />

          <SubmitButton
            onCancel={() => navigate(`/admin/sites/${siteId}`)}
            disabled={usersLoading}
          />
        </Stack>
      </BaseCard>
    </Stack>
  );
}

export default function AddStaffToSitePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      await api.post(`/sites/${id}/staff`, {
        user_id: Number(data.userId),
        role: data.role,
      });
      navigate(`/admin/sites/${id}`);
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
        <PageHeader title="Add staff to site" />

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
          defaultValues={{ userId: null, role: null }}
          onSubmit={handleSubmit}
          submitLabel="Add staff member"
          submittingLabel="Adding…"
        >
          <AddStaffFields
            siteId={id!}
            users={users}
            usersLoading={usersLoading}
          />
        </Form>
      </Stack>
    </Container>
  );
}
