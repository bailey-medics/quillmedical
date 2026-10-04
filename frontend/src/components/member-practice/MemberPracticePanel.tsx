/**
 * What one member may practise at one org_unit.
 *
 * The two halves of the authorisation model side by side, for one
 * person. What they are qualified for is theirs, true everywhere at once;
 * whether they may exercise it here is this org_unit's decision. Each
 * competency they hold gets a switch for the second, which is the only
 * choice an organisation or site has to make about them.
 *
 * The switches are a form, as on the features page: moving one changes
 * nothing until "Save changes", which asks first and lists what will
 * change, and leaving with unsaved switches asks too.
 *
 * A viewer who may also change somebody's competencies gets a "Grant
 * competency" button, which gives them one and authorises it here in one
 * step. That grant applies everywhere the person works, so it is kept to
 * a modal that says so, apart from the switches, which reach only here.
 *
 * Shared by the organisation and site pages: both are org_units, and
 * nothing here depends on which kind.
 */

import { useEffect, useMemo, useState } from "react";
import { Stack } from "@mantine/core";
import { Controller } from "react-hook-form";
import BaseCard from "@/components/base-card/BaseCard";
import {
  BodyText,
  BodyTextInline,
  ErrorMessage,
  Heading,
} from "@/components/typography";
import { ConfirmModal } from "@/components/confirm-modal";
import AddButton from "@/components/button/AddButton";
import ExtraButton from "@/components/button/ExtraButton";
import IconButton from "@/components/button/IconButton";
import Icon from "@/components/icons/Icon";
import { IconTagPlus, IconTrash, IconUser } from "@/components/icons/appIcons";
import { SolidSwitch } from "@/components/form";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import type { MemberPractice } from "@/domains/orgUnit";
import { ACTIVE_COMPETENCIES } from "@/types/cbac";
import { competencyName, rowsFor, type CompetencyRow } from "./competencyRows";
import GrantCompetencyModal from "./GrantCompetencyModal";

/** Props for {@link MemberPracticePanel}. */
export interface MemberPracticePanelProps {
  /** The member, their ceiling and what is authorised for them here. */
  practice: MemberPractice;
  /**
   * Save the switches: authorise and withdraw at this org_unit in one go.
   * Rejects, with a message to show, when any of it could not be saved.
   */
  onSave: (changes: PracticeChanges) => Promise<void>;
  /**
   * Stop them practising a competency at this org_unit straight away:
   * the "Authorised here but not held" table, which has no switches.
   */
  onWithdraw: (competency: string) => Promise<void>;
  /** Leave without saving. The form asks first if a switch has moved. */
  onCancel?: () => void;
  /** Give them a competency and authorise it here. */
  onGrantAndAuthorise: (competency: string) => Promise<void>;
  /**
   * Open their user account. Shown as an icon beside the table's search
   * and filter when given, so every action on them sits in one place.
   */
  onOpenUserAccount?: () => void;
}

/** What one save asks for, by competency id. */
export interface PracticeChanges {
  authorise: string[];
  withdraw: string[];
}

/** One switch per competency held, keyed by its id: on means authorised. */
type PracticeValues = Record<string, boolean>;

/** Which switches differ from what is saved, split by direction. */
function changesFrom(
  values: PracticeValues,
  saved: PracticeValues,
): PracticeChanges {
  const ids = Object.keys(saved).filter((id) => values[id] !== saved[id]);
  return {
    authorise: ids.filter((id) => values[id]),
    withdraw: ids.filter((id) => !values[id]),
  };
}

/**
 * Keeps the form's saved values in step with the page. A save, a grant or
 * a withdrawal from the other table reloads `practice`; switches the
 * viewer has moved but not saved are kept, and the rest follow.
 */
function SyncSaved({ saved }: { saved: PracticeValues }) {
  const { methods } = useFormContext();
  useEffect(() => {
    methods.reset(saved, { keepDirtyValues: true });
  }, [methods, saved]);
  return null;
}

/** The confirmation: what the save will authorise and withdraw. */
function ConfirmContent({
  saved,
  username,
  orgUnitName,
}: {
  saved: PracticeValues;
  username: string;
  orgUnitName: string;
}) {
  const { methods } = useFormContext();
  const { authorise, withdraw } = changesFrom(
    methods.getValues() as PracticeValues,
    saved,
  );

  return (
    <>
      You are about to change what <strong>{username}</strong> may practise at{" "}
      <strong>{orgUnitName}</strong>:
      <Stack gap={4} mt="xs" align="center">
        {authorise.map((id) => (
          <BodyText key={id}>
            <strong>{competencyName(id)}</strong> – authorise
          </BodyText>
        ))}
        {withdraw.map((id) => (
          <BodyText key={id}>
            <strong>{competencyName(id)}</strong> – withdraw
          </BodyText>
        ))}
      </Stack>
      {withdraw.length > 0 && (
        <ErrorMessage>
          Withdrawing stops them practising it here straight away. They stay
          qualified, and stay authorised anywhere else.
        </ErrorMessage>
      )}
    </>
  );
}

/** The switch for one competency, held still while a save is under way. */
function PracticeSwitch({
  row,
  disabled,
}: {
  row: CompetencyRow;
  disabled: boolean;
}) {
  const { methods, formState } = useFormContext();
  return (
    <Controller
      name={row.id}
      control={methods.control}
      render={({ field }) => (
        <SolidSwitch
          checked={field.value === true}
          onChange={field.onChange}
          disabled={disabled || formState === "submitting"}
          aria-label={`${row.name}: may practise here`}
        />
      )}
    />
  );
}

/**
 * Switch practice here on and off for each competency somebody holds.
 *
 * @param props - Component props
 * @returns The panel
 */
export default function MemberPracticePanel({
  practice,
  onSave,
  onWithdraw,
  onCancel,
  onGrantAndAuthorise,
  onOpenUserAccount,
}: MemberPracticePanelProps) {
  const [withdrawing, setWithdrawing] = useState<CompetencyRow | null>(null);
  // Undefined while closed; otherwise the competency to start with, if any.
  const [granting, setGranting] = useState<string | null | undefined>(
    undefined,
  );

  const name = practice.full_name || practice.username;

  // What the viewer may change here. A teaching admin sees every
  // competency the person holds, so nothing is hidden from them, and may
  // switch only the teaching ones: the rest are shown disabled rather
  // than left out.
  const mayChange = useMemo(() => {
    const allowed = practice.may_change;
    return (id: string) => allowed == null || allowed.includes(id);
  }, [practice.may_change]);

  const authorisedIds = useMemo(
    () => new Set(practice.authorised.map((row) => row.competency)),
    [practice.authorised],
  );
  const qualifiedIds = useMemo(
    () => new Set(practice.qualified),
    [practice.qualified],
  );

  const qualified = useMemo(
    () => rowsFor(practice.qualified),
    [practice.qualified],
  );
  // Rows here for something they do not hold. They authorise nothing,
  // and are shown so a lapsed qualification is seen rather than hidden.
  const withoutEffect = useMemo(
    () => rowsFor([...authorisedIds].filter((id) => !qualifiedIds.has(id))),
    [authorisedIds, qualifiedIds],
  );
  // What could be granted: active only, since a retired competency can
  // no longer be given, and not already held.
  const offered = useMemo(
    () =>
      rowsFor(
        ACTIVE_COMPETENCIES.map((entry) => entry.id).filter(
          (id) => !qualifiedIds.has(id) && mayChange(id),
        ),
      ),
    [qualifiedIds, mayChange],
  );

  // What is saved: a switch per competency held, on where authorised.
  const saved = useMemo(() => {
    const values: PracticeValues = {};
    for (const id of practice.qualified) values[id] = authorisedIds.has(id);
    return values;
  }, [practice.qualified, authorisedIds]);

  async function handleSubmit(
    values: PracticeValues,
  ): Promise<FormSubmitResult> {
    const changes = changesFrom(values, saved);
    const summary = [
      ...changes.authorise.map((id) => `${competencyName(id)} authorised`),
      ...changes.withdraw.map((id) => `${competencyName(id)} withdrawn`),
    ].join(", ");
    try {
      await onSave(changes);
      return {
        state: "success",
        message: { title: "Practice updated", description: summary },
      };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Failed to update practice",
          description:
            err instanceof Error ? err.message : "An unexpected error occurred",
        },
      };
    }
  }

  const qualifiedColumns: Column<CompetencyRow>[] = [
    {
      header: "Competency",
      render: (row) => row.name,
      accessor: (row) => row.name,
    },
    {
      header: "May practise here",
      // Wide enough to keep the header on one line.
      width: "200px",
      render: (row) => (
        <PracticeSwitch row={row} disabled={!mayChange(row.id)} />
      ),
    },
  ];

  const withoutEffectColumns: Column<CompetencyRow>[] = [
    {
      header: "Competency",
      render: (row) => row.name,
      accessor: (row) => row.name,
    },
    {
      header: "",
      width: practice.may_grant ? "180px" : "50px",
      render: (row) =>
        mayChange(row.id) && (
          <Stack gap="xs" align="flex-end">
            {practice.may_grant && (
              <AddButton label="Grant" onClick={() => setGranting(row.id)} />
            )}
            <IconButton
              icon={<Icon icon={<IconTrash />} />}
              onClick={() => setWithdrawing(row)}
              aria-label={`Withdraw ${row.name}`}
            />
          </Stack>
        ),
    },
  ];

  return (
    <Stack gap="lg">
      <Form<PracticeValues>
        defaultValues={saved}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        submittingLabel="Saving…"
        disableWhenClean
        confirm={{
          title: "Confirm practice changes",
          acceptLabel: "Confirm",
          cancelLabel: "Go back",
          children: (
            <ConfirmContent
              saved={saved}
              username={practice.username}
              orgUnitName={practice.org_unit_name}
            />
          ),
        }}
      >
        <SyncSaved saved={saved} />
        <Stack gap="md">
          <FormStatus />
          <BaseCard>
            <Stack gap="md">
              <BodyTextInline>
                Switch on what {name} may practise here. You will need to press
                &ldquo;Save changes&rdquo; below for these changes to take
                effect.
              </BodyTextInline>
              <DataTableControlled<CompetencyRow>
                data={qualified}
                columns={qualifiedColumns}
                getRowKey={(row) => row.id}
                emptyMessage="They hold no competencies yet"
                searchFields={(row) => [row.name]}
                action={
                  <>
                    {practice.may_grant && (
                      <ExtraButton
                        aria-label="Grant competency"
                        icon={<IconTagPlus />}
                        onClick={() => setGranting(null)}
                      />
                    )}
                    {onOpenUserAccount && (
                      <ExtraButton
                        aria-label="Their user account"
                        icon={<IconUser />}
                        onClick={onOpenUserAccount}
                      />
                    )}
                  </>
                }
              />
            </Stack>
          </BaseCard>
          <SubmitButton onCancel={onCancel} />
        </Stack>
      </Form>

      {withoutEffect.length > 0 && (
        <BaseCard>
          <Stack gap="md">
            <Heading>Authorised here but not held</Heading>
            <BodyText>
              These have no effect until {name} holds the competency again.
            </BodyText>
            <DataTableControlled<CompetencyRow>
              data={withoutEffect}
              columns={withoutEffectColumns}
              getRowKey={(row) => row.id}
              searchFields={(row) => [row.name]}
            />
          </Stack>
        </BaseCard>
      )}

      <ConfirmModal
        opened={withdrawing !== null}
        onClose={() => setWithdrawing(null)}
        onAccept={async () => {
          if (!withdrawing) return;
          await onWithdraw(withdrawing.id);
          setWithdrawing(null);
        }}
        title="Withdraw authorisation"
        acceptLabel="Withdraw"
        submittingLabel="Withdrawing…"
      >
        Are you sure you want to stop <strong>{practice.username}</strong>{" "}
        practising <strong>{withdrawing?.name}</strong> at{" "}
        {practice.org_unit_name}? They stay qualified, and stay authorised
        anywhere else.
      </ConfirmModal>

      {/* Mounted only while open, so each opening starts afresh. */}
      {granting !== undefined && (
        <GrantCompetencyModal
          opened
          onClose={() => setGranting(undefined)}
          options={offered}
          username={practice.username}
          orgUnitName={practice.org_unit_name}
          initial={granting}
          onGrant={onGrantAndAuthorise}
        />
      )}
    </Stack>
  );
}
