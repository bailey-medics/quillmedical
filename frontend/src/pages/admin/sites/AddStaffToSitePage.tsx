/**
 * Add Staff to Site Page
 *
 * Adds somebody to a site, with a role. The card is `AddStaffForm`: it
 * finds them by username or email and then shows what adding them
 * needs, or offers to create them with this site already chosen.
 *
 * Clinical lead is a post, not a capacity. Somebody made lead is added
 * as staff and then appointed, and the option is shown but not offered
 * while the post is filled.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Stack } from "@mantine/core";
import { AddStaffForm } from "@/components/add-staff-form";
import type { AddStaffValues } from "@/components/add-staff-form";
import type { FormSubmitResult } from "@/components/form/Form";
import ErrorState from "@/components/error-state/ErrorState";
import { newUserSearch } from "@/components/member-lookup";
import PageHeader from "@/components/page-header";
import { orgUnits } from "@/domains/orgUnit";

const ROLE_OPTIONS = [
  { value: "clinical_lead", label: "Clinical lead" },
  { value: "staff", label: "Staff" },
  { value: "trainee", label: "Trainee" },
];

export default function AddStaffToSitePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasClinicalLead, setHasClinicalLead] = useState(false);
  const [siteName, setSiteName] = useState("this site");

  useEffect(() => {
    async function fetchSite() {
      if (!id) {
        setLoadError("No site ID provided");
        return;
      }

      try {
        const site = await orgUnits.get(Number(id));

        // The post, not a role on a staff row: a site can have the post
        // and nobody in it, which is exactly when a lead may be added.
        setHasClinicalLead(site.clinical_lead_id !== null);
        setSiteName(site.name);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load site",
        );
      }
    }

    void fetchSite();
  }, [id]);

  const roleOptions = ROLE_OPTIONS.map((opt) =>
    opt.value === "clinical_lead" && hasClinicalLead
      ? { ...opt, disabled: true }
      : opt,
  );

  async function handleSubmit(
    values: AddStaffValues,
  ): Promise<FormSubmitResult> {
    try {
      // What somebody *is* here and what post they *hold* here are two
      // different facts. The old request ran them together under one
      // word, which is why a post could not be left vacant without also
      // taking the person off the org_unit. Clinical lead is a post; the
      // person is staff who also holds it.
      const isLead = values.role === "clinical_lead";

      await orgUnits.addMember(Number(id), {
        user_id: values.user.id,
        capacity: isLead ? "staff" : (values.role ?? "trainee"),
        // Omitted rather than sent as null, so the request says nothing
        // about a grant where none was asked for.
        ...(values.baseProfession
          ? { base_profession: values.baseProfession }
          : {}),
        ...(values.additionalCompetencies.length > 0
          ? { additional_competencies: values.additionalCompetencies }
          : {}),
      });

      if (isLead) {
        await orgUnits.setClinicalLead(Number(id), values.user.id);
      }

      navigate(`/admin/sites/${id}`, {
        state: {
          flash: {
            title: "Staff member added",
            description: `${values.user.username} has been added to this site`,
          },
        },
      });

      return { state: "success", message: { title: "Staff member added" } };
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
    <Stack gap="lg">
      <PageHeader title="Add staff to site" />

      {loadError && (
        <ErrorState title="Error loading site" message={loadError} />
      )}

      <AddStaffForm
        placeName={siteName}
        placeKind="site"
        onLookUp={(term) => orgUnits.lookUpMember(Number(id), term)}
        // The new user form opens with the address and this site already
        // filled in.
        onCreate={(term) =>
          navigate(`/admin/users/new?${newUserSearch(term, id!)}`)
        }
        roleOptions={roleOptions}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/admin/sites/${id}`)}
      />
    </Stack>
  );
}
