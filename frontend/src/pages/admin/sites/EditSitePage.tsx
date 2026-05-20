/**
 * Edit Site Page
 *
 * Form for editing an existing site's details.
 * Loads current details and allows updating name, type, location, and clinical lead.
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

const SITE_TYPE_OPTIONS = [
  { value: "hospital", label: "Hospital" },
  { value: "building", label: "Building" },
  { value: "ward", label: "Ward" },
  { value: "room", label: "Room" },
  { value: "clinic", label: "Clinic" },
  { value: "department", label: "Department" },
  { value: "virtual", label: "Virtual" },
];

interface ApiUser {
  id: number;
  username: string;
  email: string;
}

interface SiteStaff {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
}

interface SiteData {
  id: number;
  name: string;
  type: string;
  parent_id: number | null;
  location: string;
  staff: SiteStaff[];
}

interface EditSiteFormValues {
  name: string;
  type: string | null;
  location: string;
  clinicalLeadId: string | null;
}

function EditSiteFields({
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
            onCancel={() => navigate(`/admin/sites/${siteId}`)}
            disabled={usersLoading}
          />
        </Stack>
      </BaseCard>
    </Stack>
  );
}

export default function EditSitePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [site, usersResponse] = await Promise.all([
          api.get<SiteData>(`/sites/${id}`),
          api.get<{ users: ApiUser[] }>("/users?permission_level=staff"),
        ]);
        setSiteData(site);
        setUsers(usersResponse.users);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load site",
        );
      } finally {
        setLoading(false);
        setUsersLoading(false);
      }
    }

    fetchData();
  }, [id]);

  async function handleSubmit(
    data: EditSiteFormValues,
  ): Promise<FormSubmitResult> {
    try {
      await api.put(`/sites/${id}`, {
        name: data.name.trim(),
        type: data.type,
        location: data.location.trim() || null,
      });

      // Handle clinical lead assignment
      const currentLead = siteData?.staff.find(
        (s) => s.role === "clinical_lead",
      );
      const newLeadId = data.clinicalLeadId
        ? Number(data.clinicalLeadId)
        : null;

      // Remove old clinical lead if changed
      if (currentLead && currentLead.id !== newLeadId) {
        await api.del(`/sites/${id}/staff/${currentLead.id}`);
      }

      // Add new clinical lead if set and different
      if (newLeadId && (!currentLead || currentLead.id !== newLeadId)) {
        await api.post(`/sites/${id}/staff`, {
          user_id: newLeadId,
          role: "clinical_lead",
        });
      }

      navigate(`/admin/sites/${id}`);
      return {
        state: "success",
        message: { title: "Site updated" },
      };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Failed to update site",
          description:
            err instanceof Error ? err.message : "An unexpected error occurred",
        },
      };
    }
  }

  if (loading) {
    return (
      <Container size="lg">
        <Stack gap="lg">
          <Skeleton height={60} />
          <Skeleton height={200} />
        </Stack>
      </Container>
    );
  }

  if (loadError || !siteData) {
    return (
      <Container size="lg">
        <Alert
          icon={<Icon icon={<IconAlertCircle />} size="lg" />}
          title="Error loading site"
          color="var(--alert-color)"
        >
          {loadError || "Site not found"}
        </Alert>
      </Container>
    );
  }

  const currentLead = siteData.staff.find((s) => s.role === "clinical_lead");

  return (
    <Container size="lg">
      <Stack gap="lg">
        <PageHeader title="Edit site" />

        <Form<EditSiteFormValues>
          defaultValues={{
            name: siteData.name,
            type: siteData.type,
            location: siteData.location || "",
            clinicalLeadId: currentLead ? String(currentLead.id) : null,
          }}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
          submittingLabel="Saving…"
        >
          <EditSiteFields
            siteId={id!}
            users={users}
            usersLoading={usersLoading}
          />
        </Form>
      </Stack>
    </Container>
  );
}
