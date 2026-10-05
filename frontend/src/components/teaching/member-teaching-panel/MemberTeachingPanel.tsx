/**
 * MemberTeachingPanel Component
 *
 * One person's teaching at one org_unit: the modules the organisation
 * above it serves, which they are enrolled on, and whether they can
 * actually enter each. For the member page, where whoever runs a centre
 * makes a quick change to one person without walking the user form.
 *
 * The same module card as the user form's Enrolment step, so the two
 * cannot drift apart. Ticks are held until "Save enrolment" is pressed.
 * Its own button, apart from the practice switches' "Save changes"
 * above it: the two are separate forms, and one button for both would
 * hide which of them had failed.
 *
 * Three layers stand between somebody and a module: a competency, a
 * place and an enrolment. Somebody enrolled who still cannot enter is
 * told which is missing, in plain words, under the module. Ticking the
 * module again and saving puts a missing place or competency right.
 *
 * An admin has one switch here, the tick. A second button that took
 * away somebody's place at the centre was built and removed: it left
 * their modules ticked and doing nothing.
 */

import { useEffect, useMemo } from "react";
import { Stack } from "@mantine/core";
import { Controller } from "react-hook-form";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import { Heading } from "@/components/typography";
import {
  ModuleEnrolmentEditor,
  type EnrolmentOrganisation,
} from "@/components/teaching/module-enrolment-editor";
import type { MissingLayer, ModuleAccess } from "@/domains/teachingDoor";

/** What is ticked: module id to its end date, or null for no end. */
type Enrolments = Record<string, string | null>;

export interface EnrolmentChanges {
  /**
   * Modules to enrol on, each with its end as `YYYY-MM-DD` or null.
   * A module whose end date changed is in both lists: it is taken off
   * and enrolled again with the new end.
   */
  enrol: { moduleId: string; endsOn: string | null }[];
  /** Modules to take them off */
  unenrol: string[];
}

export interface MemberTeachingPanelProps {
  /** The organisation above this org_unit, and the modules it serves */
  organisation: EnrolmentOrganisation;
  /** Their way into each module, as the API answered */
  access: ModuleAccess[];
  /** Save the ticks that moved. Rejects, naming what failed, if any did. */
  onSave: (changes: EnrolmentChanges) => Promise<void>;
}

const WORDS: Record<MissingLayer, string> = {
  competency: "may not take modules",
  place: "no place at this centre",
  enrolment: "not enrolled",
};

/** What is saved: the modules they are enrolled on, and each one's end. */
function savedFrom(access: ModuleAccess[]): Enrolments {
  const saved: Enrolments = {};
  for (const module of access) {
    if (module.missing.includes("enrolment")) continue;
    saved[module.question_bank_id] = module.enrolment_ends_on
      ? module.enrolment_ends_on.slice(0, 10)
      : null;
  }
  return saved;
}

function changesFrom(values: Enrolments, saved: Enrolments): EnrolmentChanges {
  const enrol: EnrolmentChanges["enrol"] = [];
  const unenrol: string[] = [];
  for (const [moduleId, endsOn] of Object.entries(values)) {
    if (!(moduleId in saved)) {
      enrol.push({ moduleId, endsOn });
    } else if (saved[moduleId] !== endsOn) {
      unenrol.push(moduleId);
      enrol.push({ moduleId, endsOn });
    }
  }
  for (const moduleId of Object.keys(saved)) {
    if (!(moduleId in values)) unenrol.push(moduleId);
  }
  return { enrol, unenrol };
}

/** The module card, bound to the form and held still while it saves. */
function EnrolmentField({
  organisation,
  note,
}: {
  organisation: EnrolmentOrganisation;
  note: (organisationId: number, moduleId: string) => string | undefined;
}) {
  const { methods, formState } = useFormContext();
  return (
    <Controller
      name="enrolments"
      control={methods.control}
      render={({ field }) => (
        <ModuleEnrolmentEditor
          organisations={[organisation]}
          value={{ [organisation.id]: (field.value ?? {}) as Enrolments }}
          onChange={(value) => field.onChange(value[organisation.id] ?? {})}
          note={note}
          disabled={formState === "submitting"}
        />
      )}
    />
  );
}

/** Brings the form up to date when the page reloads what is saved. */
function SyncSaved({ saved }: { saved: Enrolments }) {
  const { methods } = useFormContext();
  useEffect(() => {
    methods.reset({ enrolments: saved }, { keepDirtyValues: true });
  }, [methods, saved]);
  return null;
}

export default function MemberTeachingPanel({
  organisation,
  access,
  onSave,
}: MemberTeachingPanelProps) {
  const saved = useMemo(() => savedFrom(access), [access]);
  const byModule = useMemo(
    () => new Map(access.map((module) => [module.question_bank_id, module])),
    [access],
  );
  function note(_organisationId: number, moduleId: string) {
    const module = byModule.get(moduleId);
    if (!module || module.missing.includes("enrolment")) return undefined;
    if (module.may_enter) return "Can enter this module.";
    return `Enrolled, but cannot enter yet: ${module.missing
      .map((layer) => WORDS[layer])
      .join(", ")}.`;
  }

  async function handleSubmit(values: {
    enrolments: Enrolments;
  }): Promise<FormSubmitResult> {
    try {
      await onSave(changesFrom(values.enrolments, saved));
      return { state: "success", message: { title: "Enrolment updated" } };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Failed to update enrolment",
          description:
            err instanceof Error ? err.message : "An unexpected error occurred",
        },
      };
    }
  }

  return (
    <Stack gap="md">
      <Heading>Teaching</Heading>
      <Form<{ enrolments: Enrolments }>
        defaultValues={{ enrolments: saved }}
        onSubmit={handleSubmit}
        submitLabel="Save enrolment"
        submittingLabel="Saving…"
        disableWhenClean
      >
        <SyncSaved saved={saved} />
        <Stack gap="md">
          <FormStatus />
          <EnrolmentField organisation={organisation} note={note} />
          <SubmitButton />
        </Stack>
      </Form>
    </Stack>
  );
}
