/**
 * Add Staff to Organisation Page
 *
 * Form for adding an existing user as a staff member of an organisation.
 *
 * The list used to be filtered by `?permission_level=staff`, which hid
 * everybody the old column did not call staff. That filter went with the
 * column, and no replacement was right: every candidate hid the patient
 * becoming a healthcare assistant, which is the case this page most
 * needs to support.
 *
 * So the list shows everyone, and the judgement moved here. Selecting
 * somebody who holds nothing a member of staff would opens a
 * confirmation — are you sure? — and offers to grant them a profession
 * and competencies in the same act as the membership. The grant is
 * additive on the backend, so somebody moving from patient to
 * healthcare assistant keeps access to their own record.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Stack } from "@mantine/core";
import { Controller } from "react-hook-form";
import BaseCard from "@/components/base-card/BaseCard";
import SelectField from "@/components/form/SelectField";
import MultiSelectField from "@/components/form/MultiSelectField";
import PageHeader from "@/components/page-header";
import { BodyText } from "@/components/typography";
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
import { useAuth } from "@/auth/AuthContext";
import ErrorState from "@/components/error-state/ErrorState";
import { holdsStaffLikeCompetency } from "@/lib/cbac/staffLike";
import competenciesData from "@/generated/competencies.json";
import baseProfessionsData from "@/generated/base-professions.json";

interface ApiUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  competencies: string[];
}

interface AddStaffFormValues {
  userId: string | null;
  baseProfession: string | null;
  additionalCompetencies: string[];
}

function AddStaffFields({
  orgId,
  users,
  usersLoading,
  onUserChange,
  showGrantFields,
}: {
  orgId: string;
  users: ApiUser[];
  usersLoading: boolean;
  onUserChange: (userId: string | null) => void;
  showGrantFields: boolean;
}) {
  const navigate = useNavigate();
  const { methods } = useFormContext();

  const professionOptions = useMemo(
    () =>
      baseProfessionsData.base_professions.map((p) => ({
        value: p.id,
        label: p.display_name,
      })),
    [],
  );

  const competencyOptions = useMemo(
    () =>
      competenciesData.competencies.map((c) => ({
        value: c.id,
        label: c.display_name,
      })),
    [],
  );

  return (
    <Stack gap="md">
      <FormStatus />
      <BaseCard>
        <Stack gap="md">
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
                  label: `${u.username} (${u.email})`,
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
                    placeholder="Optional — select base profession"
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
                    placeholder="Optional — select competencies"
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
            onCancel={() => navigate(`/admin/organisations/${orgId}`)}
            disabled={usersLoading}
          />
        </Stack>
      </BaseCard>
    </Stack>
  );
}

export default function AddStaffToOrgPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { reload } = useAuth();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Lifted out of the form because `confirm` is a prop on `Form`, which
  // sits above the field that sets it.
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const response = await api.get<{ users: ApiUser[] }>(
          `/users?exclude_org=${id}`,
        );
        setUsers(response.users);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load users",
        );
      } finally {
        setUsersLoading(false);
      }
    }

    fetchUsers();
  }, [id]);

  const selectedUser = users.find((u) => String(u.id) === selectedUserId);
  // `competencies` is absent on a stale cached response; treat that as
  // holding nothing rather than crashing, which prompts needlessly at
  // worst and never skips the question when it matters.
  const needsConfirmation =
    selectedUser !== undefined &&
    !holdsStaffLikeCompetency(selectedUser.competencies ?? []);

  // Undefined submits straight through — `Form` only gates when this is
  // set, so the question is asked for exactly the people it is about.
  const confirm: FormConfirmConfig | undefined = needsConfirmation
    ? {
        title: "Add as a staff member?",
        acceptLabel: "Add as staff",
        submittingLabel: "Adding…",
        children: `${selectedUser.username} holds nothing a member of staff would — only access to patient records as a patient or advocate. Adding them here makes them staff of this organisation.`,
      }
    : undefined;

  async function handleSubmit(
    data: AddStaffFormValues,
  ): Promise<FormSubmitResult> {
    try {
      await api.post(`/organisations/${id}/staff`, {
        user_id: Number(data.userId),
        // Omitted rather than sent as null, so the request says nothing
        // about a grant where none was asked for.
        ...(data.baseProfession
          ? { base_profession: data.baseProfession }
          : {}),
        ...(data.additionalCompetencies.length > 0
          ? { additional_competencies: data.additionalCompetencies }
          : {}),
      });
      await reload();
      const addedUser = users.find((u) => String(u.id) === data.userId);
      navigate(`/admin/organisations/${id}`, {
        state: {
          flash: {
            variant: "success",
            title: "Staff member added",
            description: `${addedUser?.username ?? "The staff member"} has been added to this organisation`,
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

      {loadError && (
        <ErrorState title="Error loading users" message={loadError} />
      )}

      <Form<AddStaffFormValues>
        defaultValues={{
          userId: null,
          baseProfession: null,
          additionalCompetencies: [],
        }}
        onSubmit={handleSubmit}
        confirm={confirm}
        submitLabel="Add staff member"
        submittingLabel="Adding…"
      >
        <AddStaffFields
          orgId={id!}
          users={users}
          usersLoading={usersLoading}
          onUserChange={setSelectedUserId}
          showGrantFields={needsConfirmation}
        />
      </Form>
    </Stack>
  );
}
