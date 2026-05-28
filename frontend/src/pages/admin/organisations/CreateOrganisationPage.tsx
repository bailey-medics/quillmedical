/**
 * Create Organisation Page
 *
 * Form for creating a new organisation in the system.
 * Only accessible to admin/superadmin users.
 */

import { useNavigate } from "react-router-dom";
import { Container, Stack } from "@mantine/core";
import { Controller } from "react-hook-form";
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

interface CreateFormValues {
  name: string;
  type: string | null;
  location: string;
}

function CreateFields() {
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

          <SubmitButton onCancel={() => navigate("/admin/organisations")} />
        </Stack>
      </BaseCard>
    </Stack>
  );
}

export default function CreateOrganisationPage() {
  const navigate = useNavigate();

  async function handleSubmit(
    data: CreateFormValues,
  ): Promise<FormSubmitResult> {
    try {
      await api.post("/organizations", {
        name: data.name.trim(),
        type: data.type,
        location: data.location.trim() || null,
      });
      navigate("/admin/organisations", {
        state: {
          flash: {
            variant: "success",
            title: "Organisation created",
            description: `${data.name.trim()} has been created successfully`,
          },
        },
      });
      return {
        state: "success",
        message: { title: "Organisation created" },
      };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Failed to create organisation",
          description:
            err instanceof Error ? err.message : "An unexpected error occurred",
        },
      };
    }
  }

  return (
    <Container size="lg">
      <Stack gap="lg">
        <PageHeader title="Create organisation" />

        <Form<CreateFormValues>
          defaultValues={{ name: "", type: null, location: "" }}
          onSubmit={handleSubmit}
          submitLabel="Create organisation"
          submittingLabel="Creating…"
        >
          <CreateFields />
        </Form>
      </Stack>
    </Container>
  );
}
