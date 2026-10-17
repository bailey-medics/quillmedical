/**
 * Edit Site Page
 *
 * Form for editing an existing site's details.
 * Loads current details and allows updating name, type, location, and clinical lead.
 * Only accessible to admin/superadmin users.
 *
 * Below the form, a card of its own deactivates the site: a red button and
 * a modal saying how many accounts go with it. Deactivating is not a
 * switch in the form, because it also deactivates the accounts of people
 * who belong nowhere else (`app/org_units/deactivation.py`).
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  IconBuildingHospital,
  IconBuildingOff,
} from "@components/icons/appIcons";
import { Stack, Skeleton } from "@mantine/core";
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
import {
  orgUnits,
  placeTypeOptions,
  type OrgUnitDetail,
} from "@/domains/orgUnit";
import ErrorState from "@/components/error-state/ErrorState";
import ActionCard from "@/components/action-card";
import { ConfirmModal } from "@/components/confirm-modal";

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
  const [changingStatus, setChangingStatus] = useState(false);
  const [accountsGoing, setAccountsGoing] = useState<number | null>(null);

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

    void fetchData();
  }, [id]);

  // The count is asked for as the modal opens, so it is the number as it
  // stands when somebody is deciding, not when the page loaded.
  function openStatusChange() {
    setChangingStatus(true);

    if (siteData?.is_active) {
      setAccountsGoing(null);
      orgUnits
        .deactivation(Number(id))
        .then((answer) => setAccountsGoing(answer.accounts))
        .catch(() => setAccountsGoing(null));
    }
  }

  async function changeStatus() {
    if (siteData?.is_active) {
      const done = await orgUnits.deactivate(Number(id));
      navigate(`/admin/sites/${id}`, {
        state: {
          flash: {
            variant: "success",
            title: "Site deactivated",
            description: accountsDeactivated(done.accounts),
          },
        },
      });
      return;
    }

    await orgUnits.setActive(Number(id), true);
    navigate(`/admin/sites/${id}`, {
      state: {
        flash: {
          variant: "success",
          title: "Site reactivated",
          description:
            "No account was reactivated with it. Reactivate each from its own page.",
        },
      },
    });
  }

  async function handleSubmit(
    data: EditSiteFormValues,
  ): Promise<FormSubmitResult> {
    try {
      await orgUnits.update(Number(id), {
        name: data.name.trim(),
        type: data.type as string,
        location: data.location.trim(),
      });

      // Naming a clinical lead is two things: the person is here, and
      // the person holds the post. Standing somebody down leaves the post
      // vacant without taking them off the org_unit, which is what the old
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
      >
        <EditSiteFields
          siteId={id!}
          users={users}
          usersLoading={usersLoading}
        />
      </Form>

      {siteData.is_active ? (
        <ActionCard
          icon={<IconBuildingOff />}
          title="Deactivate site"
          subtitle="Stop this site taking part. It takes no more registrations and nobody can be added to it. Results are kept."
          buttonLabel="Deactivate site"
          buttonDestructive
          onClick={openStatusChange}
        />
      ) : (
        <ActionCard
          icon={<IconBuildingHospital />}
          title="Reactivate site"
          subtitle="This site is deactivated. Making it active again brings back no account: reactivate each from its own page."
          buttonLabel="Reactivate site"
          onClick={openStatusChange}
        />
      )}

      <ConfirmModal
        opened={changingStatus}
        onClose={() => setChangingStatus(false)}
        onAccept={changeStatus}
        title={siteData.is_active ? "Deactivate site" : "Reactivate site"}
        acceptLabel={siteData.is_active ? "Deactivate" : "Reactivate"}
        submittingLabel={siteData.is_active ? "Deactivating…" : "Reactivating…"}
        destructive={siteData.is_active}
      >
        {siteData.is_active ? (
          <>
            Deactivating this site will also deactivate the accounts of anyone
            that does not belong to a second organisation or site.{" "}
            {accountsGoing === null
              ? "Counting the accounts…"
              : `${accountsDeactivated(accountsGoing, "will be")}, and each is emailed to say so.`}
          </>
        ) : (
          <>
            Reactivating <strong>{siteData.name}</strong> lets people be added
            to it again. No account is reactivated with it.
          </>
        )}
      </ConfirmModal>
    </Stack>
  );
}

/** How many accounts are, or were, deactivated, as a sentence. */
function accountsDeactivated(
  count: number,
  tense: "were" | "will be" = "were",
): string {
  const accounts = count === 1 ? "1 account" : `${count} accounts`;
  const verb = count === 1 ? tense.replace("were", "was") : tense;

  return `${accounts} ${verb} deactivated`;
}
