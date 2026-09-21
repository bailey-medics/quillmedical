/**
 * Create Site Page
 *
 * Creating a site used to be possible only from the organisation it sits
 * in, which quietly decided the answer to "what does it sit inside?"
 * before the question was asked. Here the org_unit above is picked like any
 * other field, so a ward can be put inside a building rather than only
 * inside a trust.
 *
 * Who leads the site is deliberately not asked here. The person has to be
 * at the org_unit before they can hold the post there, and both are one act
 * on the site's own pages once it exists.
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
import { orgUnits, placeTypeOptions, type OrgUnit } from "@/domains/orgUnit";
import ErrorState from "@/components/error-state/ErrorState";

interface CreateSiteFormValues {
  parentId: string | null;
  name: string;
  type: string | null;
  location: string;
}

function CreateSiteFields({
  places,
  placesLoading,
}: {
  places: OrgUnit[];
  placesLoading: boolean;
}) {
  const navigate = useNavigate();
  const { methods } = useFormContext();

  // An org_unit is offered by name and kind together, because two wards in
  // different hospitals are often called the same thing.
  const parentOptions = useMemo(
    () =>
      places.map((place) => ({
        value: String(place.id),
        label: `${place.name} (${place.type_display_name})`,
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
            rules={{ required: "Please select the place it sits inside" }}
            render={({ field, fieldState }) => (
              <SelectField
                label="Inside"
                placeholder="Search for a place"
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
                placeholder="e.g. Hills Road, Cambridge"
                value={field.value as string}
                onChange={field.onChange}
              />
            )}
          />

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
  const [places, setPlaces] = useState<OrgUnit[]>([]);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlaces() {
      try {
        setPlaces(await orgUnits.list());
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load places",
        );
      } finally {
        setPlacesLoading(false);
      }
    }

    fetchPlaces();
  }, []);

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
        }}
        onSubmit={handleSubmit}
        submitLabel="Create site"
        submittingLabel="Creating…"
      >
        <CreateSiteFields places={places} placesLoading={placesLoading} />
      </Form>
    </Stack>
  );
}
