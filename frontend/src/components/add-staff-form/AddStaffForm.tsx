/**
 * Add somebody to an org_unit as staff, in one card.
 *
 * The card opens with the member lookup and nothing else. What follows
 * depends on what the lookup says:
 *
 * - somebody with an account who may be added: the fields for adding
 *   them, a role where the page has roles, and the button that adds;
 * - nobody uses that username or address: the offer to create them;
 * - somebody already here, or an account that may not be added here:
 *   the lookup says so, and nothing more is offered.
 *
 * Looking somebody else up puts the fields away until the new answer is
 * in, so the person added is always the one the card names.
 *
 * There is no list to pick from. An admin who runs one place sees only
 * the people already there, so for most the list was empty, and the
 * lookup finds anybody with an account.
 *
 * Somebody who holds nothing a member of staff would is offered a
 * profession and competencies in the same act as the membership, and is
 * asked about before they are added. The grant is additive on the
 * backend, so a patient becoming a healthcare assistant keeps access to
 * their own record.
 */

import { useState } from "react";
import { flushSync } from "react-dom";
import { Stack } from "@mantine/core";
import { Controller } from "react-hook-form";
import BaseCard from "@/components/base-card/BaseCard";
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
import MultiSelectField from "@/components/form/MultiSelectField";
import SelectField from "@/components/form/SelectField";
import { MemberLookup } from "@/components/member-lookup";
import type { MemberLookupProps } from "@/components/member-lookup";
import { BodyText, Heading } from "@/components/typography";
import type { MemberLookupUser } from "@/domains/orgUnit";
import baseProfessionsData from "@/generated/base-professions.json";
import { useGrantScope } from "@/lib/cbac/hooks";
import { holdsStaffLikeCompetency } from "@/lib/cbac/staffLike";
import { ACTIVE_COMPETENCIES } from "@/types/cbac";

/** One role a page offers, as a select option. */
export interface AddStaffRoleOption {
  value: string;
  label: string;
  /** Shown but not choosable, such as a post already filled */
  disabled?: boolean;
}

/** What the card hands to the page when somebody is added. */
export interface AddStaffValues {
  /** The person the lookup found */
  user: MemberLookupUser;
  /** The role chosen, or null where the page offers none */
  role: string | null;
  /** A profession to grant them, for somebody holding nothing staff-like */
  baseProfession: string | null;
  /** Competencies to grant them beyond the profession's */
  additionalCompetencies: string[];
}

/** Props for {@link AddStaffForm}. */
export interface AddStaffFormProps {
  /** The org_unit's name, for the lookup's answers */
  placeName: string;
  /** "site" or "organisation", for the question asked before adding */
  placeKind: "site" | "organisation";
  /** Ask the API about one username or address */
  onLookUp: MemberLookupProps["onLookUp"];
  /** Nobody has that username or address: go and create them */
  onCreate: (term: string) => void;
  /** The roles to offer. Omit for a page that offers none */
  roleOptions?: AddStaffRoleOption[];
  /** Add the person. Returns how it went, as any form submission does */
  onSubmit: (values: AddStaffValues) => Promise<FormSubmitResult>;
  /** Leave without adding anybody */
  onCancel: () => void;
}

interface FieldValues {
  role: string | null;
  baseProfession: string | null;
  additionalCompetencies: string[];
}

const EMPTY: FieldValues = {
  role: null,
  baseProfession: null,
  additionalCompetencies: [],
};

/**
 * The lookup and, once somebody is found, the fields for adding them.
 * Inside the form, so it can clear the fields when the person changes.
 */
function AddStaffFields({
  placeName,
  onLookUp,
  onCreate,
  roleOptions,
  onCancel,
  found,
  onFoundChange,
}: Omit<AddStaffFormProps, "placeKind" | "onSubmit"> & {
  found: MemberLookupUser | null;
  onFoundChange: (user: MemberLookupUser | null) => void;
}) {
  const { methods } = useFormContext();

  // Only what the viewer may give. A teaching admin is offered the
  // teaching professions and competencies; the API refuses anything else.
  const { mayGrant, mayAssignProfession } = useGrantScope();

  const professionOptions = baseProfessionsData.base_professions
    .filter((p) => mayAssignProfession(p.id))
    .map((p) => ({ value: p.id, label: p.display_name }));

  const competencyOptions = ACTIVE_COMPETENCIES.filter((c) =>
    mayGrant(c.id),
  ).map((c) => ({ value: c.id, label: c.display_name }));

  // `competencies` is absent on a stale cached response; treat that as
  // holding nothing, which asks needlessly at worst and never skips the
  // question when it matters.
  const showGrantFields =
    found !== null && !holdsStaffLikeCompetency(found.competencies ?? []);

  return (
    <Stack gap="md">
      <FormStatus />
      <BaseCard>
        <Stack gap="md">
          <Heading>Find somebody by username or email</Heading>
          <MemberLookup
            placeName={placeName}
            onLookUp={onLookUp}
            onFound={onFoundChange}
            // Whatever was chosen for the last person is let go with them.
            onForget={() => {
              methods.reset(EMPTY);
              onFoundChange(null);
            }}
            onCreate={(term) => {
              // Leaving is the point of the button, so whatever was
              // chosen is let go first: left dirty, the form asks "are
              // you sure you want to leave?". Flushed, so the form is
              // clean before the navigation is judged, not after.
              flushSync(() => methods.reset(EMPTY));
              onCreate(term);
            }}
          />

          {found && roleOptions && (
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
          )}

          {/*
            Only for somebody holding nothing staff-like. Somebody already
            staff elsewhere needs no grant, and asking would be noise on
            the common path.
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
                    placeholder="Optional - select base profession"
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
                    placeholder="Optional - select competencies"
                    data={competencyOptions}
                    value={field.value as string[]}
                    onChange={field.onChange}
                    searchable
                  />
                )}
              />
            </>
          )}

          {found && <SubmitButton onCancel={onCancel} />}
        </Stack>
      </BaseCard>
    </Stack>
  );
}

/**
 * Find somebody, then add them as staff.
 *
 * @param props - Component props
 * @returns The card
 */
export default function AddStaffForm({
  placeKind,
  onSubmit,
  ...fieldProps
}: AddStaffFormProps) {
  // Above the form, because `confirm` is a prop on `Form` and depends on
  // who was found.
  const [found, setFound] = useState<MemberLookupUser | null>(null);

  const needsConfirmation =
    found !== null && !holdsStaffLikeCompetency(found.competencies ?? []);

  // Undefined submits straight through: `Form` only asks when this is
  // set, so the question is put for exactly the people it is about.
  const confirm: FormConfirmConfig | undefined =
    found && needsConfirmation
      ? {
          title: "Add as a staff member?",
          acceptLabel: "Add as staff",
          submittingLabel: "Adding…",
          children: `${found.username} holds nothing a member of staff would - only access to patient records as a patient or advocate. Adding them here makes them staff of this ${placeKind}.`,
        }
      : undefined;

  async function handleSubmit(data: FieldValues): Promise<FormSubmitResult> {
    // The button shows only once somebody is found, so this is a guard
    // rather than a path.
    if (!found) {
      return {
        state: "error",
        message: { title: "Find somebody to add first" },
      };
    }

    return onSubmit({
      user: found,
      role: data.role,
      baseProfession: data.baseProfession,
      additionalCompetencies: data.additionalCompetencies,
    });
  }

  return (
    <Form<FieldValues>
      defaultValues={EMPTY}
      onSubmit={handleSubmit}
      confirm={confirm}
      submitLabel="Add staff member"
      submittingLabel="Adding…"
    >
      <AddStaffFields {...fieldProps} found={found} onFoundChange={setFound} />
    </Form>
  );
}
