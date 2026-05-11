/**
 * Edit Organisation Page
 *
 * Form for editing an existing organisation's details.
 * Loads the current details and allows updating name, type, and location.
 * Only accessible to admin/superadmin users.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Container, Stack, Alert, Skeleton } from "@mantine/core";
import { Controller } from "react-hook-form";
import { IconAlertCircle } from "@components/icons/appIcons";
import Icon from "@/components/icons";
import BaseCard from "@/components/base-card/BaseCard";
import TextField from "@/components/form/TextField";
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

/** Organisation type options for the select input */
const ORGANISATION_TYPE_OPTIONS = [
  { value: "hospital_team", label: "Hospital team" },
  { value: "gp_practice", label: "GP practice" },
  { value: "private_clinic", label: "Private clinic" },
  { value: "department", label: "Department" },
  { value: "teaching_establishment", label: "Teaching establishment" },
];

interface OrganisationData {
  id: number;
  name: string;
  type: string;
  location: string | null;
}

interface EditFormValues {
  name: string;
  type: string | null;
  location: string;
}

function EditFields({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const { methods } = useFormContext();

  return (
    <Stack gap="md">
      <FormStatus />
      <BaseCard>
        <Stack gap="md">
          <TextField
            label="Organisation name"
            placeholder="e.g. Great Eastern Hospital"
            {...methods.register("name", {
              required: "Organisation name is required",
              validate: (v: string) =>
                v.trim().length > 0 || "Organisation name is required",
            })}
            error={methods.formState.errors.name?.message as string}
            withAsterisk
          />

          <Controller
            name="type"
            control={methods.control}
            rules={{ required: "Organisation type is required" }}
            render={({ field, fieldState }) => (
              <SelectField
                label="Organisation type"
                placeholder="Select a type"
                data={ORGANISATION_TYPE_OPTIONS}
                value={field.value as string | null}
                onChange={field.onChange}
                error={fieldState.error?.message}
                withAsterisk
              />
            )}
          />

          <TextField
            label="Location"
            placeholder="e.g. London"
            {...methods.register("location")}
          />

          <SubmitButton
            onCancel={() => navigate(`/admin/organisations/${orgId}`)}
          />
        </Stack>
      </BaseCard>
    </Stack>
  );
}

export default function EditOrganisationPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orgData, setOrgData] = useState<OrganisationData | null>(null);

  useEffect(() => {
    async function fetchOrganisation() {
      try {
        const data = await api.get<OrganisationData>(`/organizations/${id}`);
        setOrgData(data);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load organisation",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchOrganisation();
  }, [id]);

  async function handleSubmit(data: EditFormValues): Promise<FormSubmitResult> {
    try {
      await api.put(`/organizations/${id}`, {
        name: data.name.trim(),
        type: data.type,
        location: data.location.trim() || null,
      });
      return {
        state: "success",
        message: { title: "Organisation updated" },
      };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Failed to update organisation",
          description:
            err instanceof Error ? err.message : "An unexpected error occurred",
        },
      };
    }
  }

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={60} />
          <Skeleton height={200} />
        </Stack>
      </Container>
    );
  }

  if (loadError) {
    return (
      <Container size="lg" py="xl">
        <Alert
          icon={<Icon icon={<IconAlertCircle />} size="lg" />}
          title="Error loading organisation"
          color="var(--alert-color)"
        >
          {loadError}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Edit organisation" />

        <Form<EditFormValues>
          defaultValues={{
            name: orgData?.name ?? "",
            type: orgData?.type ?? null,
            location: orgData?.location ?? "",
          }}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
          submittingLabel="Saving…"
          disableWhenClean
        >
          <EditFields orgId={id!} />
        </Form>
      </Stack>
    </Container>
  );
}
