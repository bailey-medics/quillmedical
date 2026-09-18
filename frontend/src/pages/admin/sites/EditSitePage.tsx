/**
 * Edit Site Page
 *
 * Form for editing an existing site's details.
 * Loads current details and allows updating name, type, location, and clinical lead.
 * Only accessible to admin/superadmin users.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Stack, Skeleton } from "@mantine/core";
import { Controller } from "react-hook-form";
import BaseCard from "@/components/base-card/BaseCard";
import SolidSwitch from "@/components/form/SolidSwitch";
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
import {
  orgUnits,
  placeTypeOptions,
  type OrgUnitDetail,
} from "@/domains/orgUnit";
import ErrorState from "@/components/error-state/ErrorState";

interface ApiUser {
  id: number;
  username: string;
  email: string;
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
  siteActive,
  onToggleActive,
}: {
  siteId: string;
  users: ApiUser[];
  usersLoading: boolean;
  siteActive: boolean;
  onToggleActive: (active: boolean) => void;
}) {
  const navigate = useNavigate();
  const { methods } = useFormContext();

  return (
    <Stack gap="md">
      <FormStatus />
      <BaseCard>
        <Stack gap="md">
          <SolidSwitch
            label="Site status"
            checked={siteActive}
            onChange={(e) => onToggleActive(e.currentTarget.checked)}
            onLabel="Active"
            offLabel="Inactive"
          />
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
  const [siteData, setSiteData] = useState<OrgUnitDetail | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!id) {
        setLoadError("No site ID provided");
        setLoading(false);
        return;
      }
      try {
        const [site, usersResponse] = await Promise.all([
          orgUnits.get(Number(id)),
          api.get<{ users: ApiUser[] }>("/users"),
        ]);
        setSiteData(site);
        setIsActive(site.is_active);
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

  async function handleToggleActive(active: boolean) {
    setIsActive(active);
  }

  async function handleSubmit(
    data: EditSiteFormValues,
  ): Promise<FormSubmitResult> {
    try {
      // Update site status if changed
      if (siteData && isActive !== siteData.is_active) {
        await orgUnits.setActive(Number(id), isActive);
      }

      await orgUnits.update(Number(id), {
        name: data.name.trim(),
        type: data.type as string,
        location: data.location.trim(),
      });

      // Naming a clinical lead is two things: the person is here, and
      // the person holds the post. Standing somebody down leaves the post
      // vacant without taking them off the place, which is what the old
      // "remove the staff row" did and should not have.
      const currentLead = siteData?.members.find(
        (member) => member.id === siteData?.clinical_lead_id,
      );
      const newLeadId = data.clinicalLeadId
        ? Number(data.clinicalLeadId)
        : null;

      if (currentLead?.id !== newLeadId) {
        if (newLeadId !== null) {
          await orgUnits.addMember(Number(id), {
            user_id: newLeadId,
            capacity: "staff",
          });
        }
        await orgUnits.setClinicalLead(Number(id), newLeadId);
      }

      // Build description of what changed
      const changes: string[] = [];
      if (siteData && isActive !== siteData.is_active) {
        changes.push(isActive ? "Site activated" : "Site deactivated");
      }
      if (data.name.trim() !== siteData!.name) {
        changes.push("Name updated");
      }
      if (data.type !== siteData!.type) {
        changes.push("Type updated");
      }
      if ((data.location.trim() || "") !== (siteData!.location || "")) {
        changes.push("Location updated");
      }
      const currentLeadId = currentLead ? currentLead.id : null;
      if (newLeadId !== currentLeadId) {
        changes.push("Clinical lead updated");
      }

      const description =
        changes.length > 0 ? changes.join(". ") : "No changes made";

      navigate(`/admin/sites/${id}`, {
        state: {
          flash: {
            variant: "success",
            title: "Site updated",
            description,
          },
        },
      });
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
      <Stack gap="lg">
        <Skeleton height={60} />
        <Skeleton height={200} />
      </Stack>
    );
  }

  if (loadError || !siteData) {
    return (
      <ErrorState
        title="Error loading site"
        message={loadError || "Site not found"}
      />
    );
  }

  const currentLead = siteData.members.find(
    (member) => member.id === siteData.clinical_lead_id,
  );

  const statusChanged = siteData ? isActive !== siteData.is_active : false;

  return (
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
        confirm={
          statusChanged
            ? {
                title: isActive ? "Activate site" : "Deactivate site",
                children: isActive
                  ? "Are you sure you want to activate this site?"
                  : "Are you sure you want to deactivate this site?",
                acceptLabel: isActive ? "Activate" : "Deactivate",
              }
            : undefined
        }
      >
        <EditSiteFields
          siteId={id!}
          users={users}
          usersLoading={usersLoading}
          siteActive={isActive}
          onToggleActive={handleToggleActive}
        />
      </Form>
    </Stack>
  );
}
