/**
 * Add Site to Organisation Page
 *
 * Form for creating a new site and linking it to the current organisation.
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
import TextField from "@/components/form/TextField";
import PageHeader from "@/components/page-header";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import { api } from "@/lib/api";

interface ApiUser {
  id: number;
  username: string;
  email: string;
}

const SITE_TYPE_OPTIONS = [
  { value: "hospital", label: "Hospital" },
  { value: "building", label: "Building" },
  { value: "ward", label: "Ward" },
  { value: "room", label: "Room" },
  { value: "clinic", label: "Clinic" },
  { value: "department", label: "Department" },
  { value: "virtual", label: "Virtual" },
];

interface AddSiteFormValues {
  name: string;
  type: string | null;
  location: string;
  clinicalLeadId: string | null;
}

function AddSiteFields({
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
            name="name"
            control={methods.control}
            rules={{ required: "Site name is required" }}
            render={({ field, fieldState }) => (
              <TextField
                label="Name"
                placeholder="e.g. Addenbrooke's Hospital"
                value={field.value as string}
                onChange={field.onChange}
                error={fieldState.error?.message}
                withAsterisk
              />
            )}
          />

          <Controller
            name="type"
            control={methods.control}
            rules={{ required: "Please select a site type" }}
            render={({ field, fieldState }) => (
              <SelectField
                label="Type"
                placeholder="Select site type"
                data={SITE_TYPE_OPTIONS}
                value={field.value as string | null}
                onChange={field.onChange}
                error={fieldState.error?.message}
                withAsterisk
              />
            )}
          />

          <Controller
            name="location"
            control={methods.control}
            render={({ field }) => (
              <TextField
                label="Location"
                placeholder="e.g. Hills Road, Cambridge"
                value={field.value as string}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="clinicalLeadId"
            control={methods.control}
            render={({ field, fieldState }) => (
              <SelectField
                label="Clinical lead"
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
                clearable
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

export default function AddSiteToOrgPage() {
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
    data: AddSiteFormValues,
  ): Promise<FormSubmitResult> {
    try {
      // Create the site
      const site = await api.post<{ id: number }>("/sites", {
        name: data.name,
        type: data.type,
        location: data.location || null,
      });

      // Link it to this organisation
      await api.post(`/organizations/${id}/sites/${site.id}`, {});

      // Assign clinical lead if selected
      if (data.clinicalLeadId) {
        await api.post(`/sites/${site.id}/staff`, {
          user_id: Number(data.clinicalLeadId),
          role: "clinical_lead",
        });
      }

      navigate(`/admin/organisations/${id}`);
      return {
        state: "success",
        message: { title: "Site created and linked" },
      };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Failed to create site",
          description:
            err instanceof Error ? err.message : "An unexpected error occurred",
        },
      };
    }
  }

  return (
    <Container size="lg">
      <Stack gap="lg">
        <PageHeader title="Add site" />

        {loadError && (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="lg" />}
            title="Error loading users"
            color="var(--alert-color)"
          >
            {loadError}
          </Alert>
        )}

        <Form<AddSiteFormValues>
          defaultValues={{
            name: "",
            type: null,
            location: "",
            clinicalLeadId: null,
          }}
          onSubmit={handleSubmit}
          submitLabel="Create site"
          submittingLabel="Creating…"
        >
          <AddSiteFields
            orgId={id!}
            users={users}
            usersLoading={usersLoading}
          />
        </Form>
      </Stack>
    </Container>
  );
}
