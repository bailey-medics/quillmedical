/**
 * Create Site Page
 *
 * Creating a site used to be possible only from the organisation it sits
 * in. Here the organisation is picked like any other field, so a site can
 * be added from the list of sites.
 *
 * Only organisations are offered. The tree is two levels for now, an
 * organisation and the sites directly inside it, and the API refuses a
 * site inside a site. Which organisations are offered is whatever the API
 * lists for the caller: every one for an operator, and for a teaching
 * admin the ones they belong to.
 *
 * A clinical lead may be named as the site is made. The person has to be
 * at the org_unit before they can hold the post there, so once the site
 * exists they are added to it as staff and then appointed. The field is
 * for whoever may appoint one: `manage_staff_membership`, or a scoped
 * manager such as `manage_teaching`.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { orgUnits, placeTypeOptions, type OrgUnit } from "@/domains/orgUnit";
import ErrorState from "@/components/error-state/ErrorState";
import { useHasAnyCompetency } from "@/lib/cbac/hooks";
import { SCOPED_MANAGER_IDS } from "@/types/cbac";

interface ApiUser {
  id: number;
  username: string;
  email: string;
}

interface CreateSiteFormValues {
  parentId: string | null;
  name: string;
  type: string | null;
  location: string;
  clinicalLeadId: string | null;
}

function CreateSiteFields({
  places,
  placesLoading,
  users,
  mayNameLead,
}: {
  places: OrgUnit[];
  placesLoading: boolean;
  users: ApiUser[];
  /** Whether the viewer may appoint the site's clinical lead */
  mayNameLead: boolean;
}) {
  const navigate = useNavigate();
  const { methods } = useFormContext();

  // Organisations only: a site sits directly inside one. Offered by
  // name alone, since the field already says they are organisations.
  const parentOptions = useMemo(
    () =>
      places
        .filter((place) => place.is_root)
        .map((place) => ({
          value: String(place.id),
          label: place.name,
        })),
    [places],
  );

  return (
    <Stack gap="md">
      <FormStatus />
      <BaseCard>
        <Stack gap="md">
          <Controller
            name="parentId"
            control={methods.control}
            rules={{ required: "Please select an organisation" }}
            render={({ field, fieldState }) => (
              <SelectField
                label="Organisation"
                placeholder="Search for an organisation"
                data={parentOptions}
                value={field.value as string | null}
                onChange={field.onChange}
                error={fieldState.error?.message}
                searchable
                disabled={placesLoading}
                withAsterisk
              />
            )}
          />

          <Controller
            name="name"
            control={methods.control}
            rules={{ required: "Site name is required" }}
            render={({ field, fieldState }) => (
              <TextField
                label="Name"
                placeholder="e.g. Ward 12"
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

          {mayNameLead && (
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
                  disabled={placesLoading}
                />
              )}
            />
          )}

          <SubmitButton
            onCancel={() => navigate("/admin/sites")}
            disabled={placesLoading}
          />
        </Stack>
      </BaseCard>
    </Stack>
  );
}

export default function CreateSitePage() {
  const navigate = useNavigate();
  // The clinical lead picker, and the people behind it, are for somebody
  // who may appoint one, which is what the route that sets the lead asks.
  const mayNameLead = useHasAnyCompetency(
    "manage_staff_membership",
    ...SCOPED_MANAGER_IDS,
  );
  const [places, setPlaces] = useState<OrgUnit[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlaces() {
      try {
        const [found, people] = await Promise.all([
          orgUnits.list(),
          mayNameLead
            ? api.get<{ users: ApiUser[] }>("/users")
            : Promise.resolve({ users: [] }),
        ]);
        setPlaces(found);
        setUsers(people.users);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load places",
        );
      } finally {
        setPlacesLoading(false);
      }
    }

    fetchPlaces();
  }, [mayNameLead]);

  async function handleSubmit(
    data: CreateSiteFormValues,
  ): Promise<FormSubmitResult> {
    try {
      const site = await orgUnits.create({
        name: data.name.trim(),
        type: data.type as string,
        parent_id: Number(data.parentId),
        location: data.location.trim() || null,
      });

      // Naming a clinical lead is two acts: the person is at the
      // org_unit, and the person holds the post there.
      if (mayNameLead && data.clinicalLeadId) {
        await orgUnits.addMember(site.id, {
          user_id: Number(data.clinicalLeadId),
          capacity: "staff",
        });
        await orgUnits.setClinicalLead(site.id, Number(data.clinicalLeadId));
      }

      navigate(`/admin/sites/${site.id}`, {
        state: {
          flash: {
            variant: "success",
            title: "Site created",
            description: `${site.name} has been created`,
          },
        },
      });
      return { state: "success", message: { title: "Site created" } };
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
        <ErrorState title="Error loading places" message={loadError} />
      )}

      <Form<CreateSiteFormValues>
        defaultValues={{
          parentId: null,
          name: "",
          type: null,
          location: "",
          clinicalLeadId: null,
        }}
        onSubmit={handleSubmit}
        submitLabel="Create site"
        submittingLabel="Creating…"
      >
        <CreateSiteFields
          places={places}
          placesLoading={placesLoading}
          users={users}
          mayNameLead={mayNameLead}
        />
      </Form>
    </Stack>
  );
}
