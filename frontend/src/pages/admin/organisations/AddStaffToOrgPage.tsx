/**
 * Add Staff to Organisation Page
 *
 * Adds somebody to an organisation as staff. The card is
 * `AddStaffForm`: it finds them by username or email and then shows
 * what adding them needs, or offers to create them with this
 * organisation already chosen.
 *
 * An organisation offers no role: everybody added here is staff.
 * Somebody who holds nothing a member of staff would is offered a
 * profession and competencies, and asked about before they are added,
 * which is the case of a patient becoming a healthcare assistant.
 */

import { useNavigate, useParams } from "react-router-dom";
import { Stack } from "@mantine/core";
import { useAuth } from "@/auth/AuthContext";
import { AddStaffForm } from "@/components/add-staff-form";
import type { AddStaffValues } from "@/components/add-staff-form";
import type { FormSubmitResult } from "@/components/form/Form";
import { newUserSearch } from "@/components/member-lookup";
import PageHeader from "@/components/page-header";
import { orgUnits } from "@/domains/orgUnit";

export default function AddStaffToOrgPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { reload } = useAuth();

  async function handleSubmit(
    values: AddStaffValues,
  ): Promise<FormSubmitResult> {
    try {
      await orgUnits.addMember(Number(id), {
        user_id: values.user.id,
        // An org_unit takes trainees and external assessors too, so the
        // request says which; here it is always staff.
        capacity: "staff",
        // Omitted rather than sent as null, so the request says nothing
        // about a grant where none was asked for.
        ...(values.baseProfession
          ? { base_profession: values.baseProfession }
          : {}),
        ...(values.additionalCompetencies.length > 0
          ? { additional_competencies: values.additionalCompetencies }
          : {}),
      });
      await reload();

      navigate(`/admin/organisations/${id}`, {
        state: {
          flash: {
            variant: "success",
            title: "Staff member added",
            description: `${values.user.username} has been added to this organisation`,
          },
        },
      });

      return {
        state: "success",
        message: { title: "Staff member added" },
      };
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
      <PageHeader title="Add staff member" />

      <AddStaffForm
        placeName="this organisation"
        placeKind="organisation"
        onLookUp={(term) => orgUnits.lookUpMember(Number(id), term)}
        // The new user form opens with the address and this organisation
        // already filled in.
        onCreate={(term) =>
          navigate(`/admin/users/new?${newUserSearch(term, id!)}`)
        }
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/admin/organisations/${id}`)}
      />
    </Stack>
  );
}
