/**
 * Add Site to Organisation Page
 *
 * Form for creating a new site and linking it to the current organisation.
 * Only accessible to admin/superadmin users.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Stack } from "@mantine/core";
import { Controller } from "react-hook-form";
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
import { orgUnits, placeTypeOptions } from "@/domains/orgUnit";
import ErrorState from "@/components/error-state/ErrorState";

interface ApiUser {
  id: number;
  username: string;
  email: string;
}

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
                placeholder="e.g. Angel's Hospital"
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
                data={placeTypeOptions}
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
                placeholder="e.g. 42 Example Lane, Exampletown EX1 2AB"
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
        const response = await api.get<{ users: ApiUser[] }>("/users");
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
      // Create the site inside this organisation. The link is written
      // in the same transaction, so there is no window where the site
      // belongs nowhere — which is what the second call used to leave.
      const site = await orgUnits.create({
        name: data.name,
        type: data.type as string,
        parent_id: Number(id),
        location: data.location || null,
      });

      // Naming a clinical lead is two acts now: the person is at the
      // org_unit, and the person holds the post. They used to be one, which
      // meant a post could not be vacant without also removing the
      // person — and a vacancy is a real state worth being able to say.
      if (data.clinicalLeadId) {
        await orgUnits.addMember(site.id, {
          user_id: Number(data.clinicalLeadId),
          capacity: "staff",
        });
        await orgUnits.setClinicalLead(site.id, Number(data.clinicalLeadId));
      }

      navigate(`/admin/organisations/${id}`, {
        state: {
          flash: {
            variant: "success",
            title: "Site created",
            description: `${data.name} has been created and linked`,
          },
        },
      });
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
    <Stack gap="lg">
      <PageHeader title="Add site" />

      {loadError && (
        <ErrorState title="Error loading users" message={loadError} />
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
        <AddSiteFields orgId={id!} users={users} usersLoading={usersLoading} />
      </Form>
    </Stack>
  );
}
