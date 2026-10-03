/**
 * Add Staff to Site Page
 *
 * Form for adding a staff member to a site with a role.
 *
 * Two ways to name the person. The picker lists the people the admin
 * can already see who are not yet here, which for somebody who runs
 * only this site is nobody: they see the site's members and no one
 * else. So the page opens with a lookup by username or email, which finds somebody
 * with an account elsewhere, or offers to create them with this site
 * already chosen.
 *
 * Like the organisation staff picker, the list is unfiltered: there is
 * no rank left to filter on, and any filter would hide the patient
 * becoming a healthcare assistant – the case the picker most needs to
 * support. So selecting somebody who holds nothing a member of staff
 * would opens a confirmation, and offers to grant them a profession and
 * competencies in the same act as the membership. The grant is additive
 * on the backend, so what they already hold survives.
 */

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { Stack } from "@mantine/core";
import { Controller } from "react-hook-form";
import BaseCard from "@/components/base-card/BaseCard";
import SelectField from "@/components/form/SelectField";
import MultiSelectField from "@/components/form/MultiSelectField";
import PageHeader from "@/components/page-header";
import { BodyText, Heading } from "@/components/typography";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type {
  FormConfirmConfig,
  FormSubmitResult,
} from "@/components/form/Form";
import { api } from "@/lib/api";
import { orgUnits, type MemberLookupUser } from "@/domains/orgUnit";
import { MemberLookup, newUserSearch } from "@/components/member-lookup";
import ErrorState from "@/components/error-state/ErrorState";
import { holdsStaffLikeCompetency } from "@/lib/cbac/staffLike";
import { ACTIVE_COMPETENCIES } from "@/types/cbac";
import { useGrantScope } from "@/lib/cbac/hooks";
import baseProfessionsData from "@/generated/base-professions.json";

const ROLE_OPTIONS = [
  { value: "clinical_lead", label: "Clinical lead" },
  { value: "staff", label: "Staff" },
  { value: "trainee", label: "Trainee" },
];

interface ApiUser {
  id: number;
  username: string;
  /** Absent for somebody found by lookup, whose address is not sent back */
  email?: string;
  competencies: string[];
}

interface AddStaffFormValues {
  userId: string | null;
  role: string | null;
  baseProfession: string | null;
  additionalCompetencies: string[];
}

function AddStaffFields({
  siteId,
  siteName,
  users,
  usersLoading,
  hasClinicalLead,
  onUserChange,
  onFound,
  showGrantFields,
}: {
  siteId: string;
  siteName: string;
  users: ApiUser[];
  usersLoading: boolean;
  hasClinicalLead: boolean;
  onUserChange: (userId: string | null) => void;
  /** Somebody the lookup found: offer them in the picker */
  onFound: (user: MemberLookupUser) => void;
  showGrantFields: boolean;
}) {
  const navigate = useNavigate();
  const { methods } = useFormContext();

  const roleOptions = ROLE_OPTIONS.map((opt) =>
    opt.value === "clinical_lead" && hasClinicalLead
      ? { ...opt, disabled: true }
      : opt,
  );

  // Only what the viewer may give. A teaching admin is offered the
  // teaching professions and competencies; the API refuses anything else.
  const { mayGrant, mayAssignProfession } = useGrantScope();

  const professionOptions = baseProfessionsData.base_professions
    .filter((p) => mayAssignProfession(p.id))
    .map((p) => ({
      value: p.id,
      label: p.display_name,
    }));

  const competencyOptions = ACTIVE_COMPETENCIES.filter((c) =>
    mayGrant(c.id),
  ).map((c) => ({
    value: c.id,
    label: c.display_name,
  }));

  return (
    <Stack gap="md">
      <FormStatus />
      <BaseCard>
        <Stack gap="md">
          <Heading>Find somebody by username or email</Heading>
          <MemberLookup
            placeName={siteName}
            onLookUp={(term) => orgUnits.lookUpMember(Number(siteId), term)}
            onFound={(found) => {
              onFound(found);
              // Chosen for them: the lookup was the choosing.
              methods.setValue("userId", String(found.id), {
                shouldDirty: true,
                shouldValidate: true,
              });
              onUserChange(String(found.id));
            }}
            // The new user form opens with the address and this site
            // already filled in.
            onCreate={(term) => {
              // Leaving is the point of the button, so whatever was
              // chosen below is let go first. Left dirty, the form asked
              // "are you sure you want to leave?" of somebody who had
              // just pressed "Create new user". Flushed, so the form is
              // clean before the navigation is judged, not after.
              flushSync(() => methods.reset());
              navigate(`/admin/users/new?${newUserSearch(term, siteId)}`);
            }}
          />
        </Stack>
      </BaseCard>
      <BaseCard>
        <Stack gap="md">
          <Heading>Add to this site</Heading>
          {users.length === 0 && !usersLoading && (
            <BodyText>
              Nobody you can see is waiting to be added. Find them by username
              or email above.
            </BodyText>
          )}
          <Controller
            name="userId"
            control={methods.control}
            rules={{ required: "Please select a user" }}
            render={({ field, fieldState }) => (
              <SelectField
                label="User"
                placeholder="Search for a user"
                data={users.map((u) => ({
                  value: String(u.id),
                  label: u.email ? `${u.username} (${u.email})` : u.username,
                }))}
                value={field.value as string | null}
                onChange={(value) => {
                  field.onChange(value);
                  onUserChange(value);
                }}
                error={fieldState.error?.message}
                searchable
                disabled={usersLoading}
                withAsterisk
              />
            )}
          />

          <Controller
            name="role"
            control={methods.control}
            rules={{ required: "Please select a role" }}
            render={({ field, fieldState }) => (
              <SelectField
                label="Role"
                placeholder="Select a role"
                data={roleOptions}
                value={field.value as string | null}
                onChange={field.onChange}
                error={fieldState.error?.message}
                withAsterisk
              />
            )}
          />

          {/*
            Shown only where the selected person holds nothing staff-like.
            Somebody already staff elsewhere needs no grant, and asking
            would be noise on the common path.
          */}
          {showGrantFields && (
            <>
              <BodyText>
                This person holds nothing a member of staff would. Grant them
                what they need for the job, or leave both blank to add them
                without any.
              </BodyText>

              <Controller
                name="baseProfession"
                control={methods.control}
                render={({ field }) => (
                  <SelectField
                    label="Base profession"
                    description="Grants that profession's competencies. What they already hold is kept."
                    placeholder="Optional – select base profession"
                    data={professionOptions}
                    value={field.value as string | null}
                    onChange={field.onChange}
                    searchable
                  />
                )}
              />

              <Controller
                name="additionalCompetencies"
                control={methods.control}
                render={({ field }) => (
                  <MultiSelectField
                    label="Additional competencies"
                    description="Anything beyond the profession's defaults"
                    placeholder="Optional – select competencies"
                    data={competencyOptions}
                    value={field.value as string[]}
                    onChange={field.onChange}
                    searchable
                  />
                )}
              />
            </>
          )}

          <SubmitButton
            onCancel={() => navigate(`/admin/sites/${siteId}`)}
            disabled={usersLoading}
          />
        </Stack>
      </BaseCard>
    </Stack>
  );
}

export default function AddStaffToSitePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasClinicalLead, setHasClinicalLead] = useState(false);
  // Lifted out of the form because `confirm` is a prop on `Form`, which
  // sits above the field that sets it.
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState("this site");

  useEffect(() => {
    async function fetchData() {
      if (!id) {
        setLoadError("No site ID provided");
        setUsersLoading(false);
        return;
      }
      try {
        const [usersResponse, siteResponse] = await Promise.all([
          api.get<{ users: ApiUser[] }>("/users"),
          orgUnits.get(Number(id)),
        ]);
        // Filter out users already at this org_unit
        const existingStaffIds = new Set(
          siteResponse.members.map((member) => member.id),
        );
        setUsers(
          usersResponse.users.filter((u) => !existingStaffIds.has(u.id)),
        );
        // The post, not a role on a staff row: a site can have the post
        // and nobody in it, which is exactly when a lead may be added.
        setHasClinicalLead(siteResponse.clinical_lead_id !== null);
        setSiteName(siteResponse.name);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load data",
        );
      } finally {
        setUsersLoading(false);
      }
    }

    fetchData();
  }, [id]);

  const selectedUser = users.find((u) => String(u.id) === selectedUserId);
  // `competencies` is absent on a stale cached response; treat that as
  // holding nothing rather than crashing, which prompts needlessly at
  // worst and never skips the question when it matters.
  const needsConfirmation =
    selectedUser !== undefined &&
    !holdsStaffLikeCompetency(selectedUser.competencies ?? []);

  // Undefined submits straight through – `Form` only gates when this is
  // set, so the question is asked for exactly the people it is about.
  const confirm: FormConfirmConfig | undefined = needsConfirmation
    ? {
        title: "Add as a staff member?",
        acceptLabel: "Add as staff",
        submittingLabel: "Adding…",
        children: `${selectedUser.username} holds nothing a member of staff would – only access to patient records as a patient or advocate. Adding them here makes them staff of this site.`,
      }
    : undefined;

  async function handleSubmit(
    data: AddStaffFormValues,
  ): Promise<FormSubmitResult> {
    try {
      // What somebody *is* here and what post they *hold* here are two
      // different facts. The old request ran them together under one
      // word, which is why a post could not be left vacant without also
      // taking the person off the org_unit. Clinical lead is a post; the
      // person is staff who also holds it.
      const isLead = data.role === "clinical_lead";

      await orgUnits.addMember(Number(id), {
        user_id: Number(data.userId),
        capacity: isLead ? "staff" : (data.role ?? "trainee"),
        // Omitted rather than sent as null, so the request says nothing
        // about a grant where none was asked for.
        ...(data.baseProfession
          ? { base_profession: data.baseProfession }
          : {}),
        ...(data.additionalCompetencies.length > 0
          ? { additional_competencies: data.additionalCompetencies }
          : {}),
      });

      if (isLead) {
        await orgUnits.setClinicalLead(Number(id), Number(data.userId));
      }
      const addedUser = users.find((u) => String(u.id) === data.userId);
      navigate(`/admin/sites/${id}`, {
        state: {
          flash: {
            title: "Staff member added",
            description: addedUser
              ? `${addedUser.username} has been added to this site`
              : undefined,
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
        <ErrorState title="Error loading users" message={loadError} />
      )}

      <Form<AddStaffFormValues>
        defaultValues={{
          userId: null,
          role: null,
          baseProfession: null,
          additionalCompetencies: [],
        }}
        onSubmit={handleSubmit}
        confirm={confirm}
        submitLabel="Add staff member"
        submittingLabel="Adding…"
      >
        <AddStaffFields
          siteId={id!}
          siteName={siteName}
          onFound={(found) =>
            setUsers((current) =>
              current.some((u) => u.id === found.id)
                ? current
                : [...current, found],
            )
          }
          users={users}
          usersLoading={usersLoading}
          hasClinicalLead={hasClinicalLead}
          onUserChange={setSelectedUserId}
          showGrantFields={needsConfirmation}
        />
      </Form>
    </Stack>
  );
}
