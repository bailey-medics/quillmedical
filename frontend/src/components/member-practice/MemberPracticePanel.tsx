/**
 * What one member may practise at one org_unit.
 *
 * The two halves of the authorisation model side by side, for one
 * person. What they are qualified for is theirs, true everywhere at once;
 * whether they may exercise it here is this org_unit's decision. Each
 * competency they hold gets a switch for the second, which is the only
 * choice an organisation or site has to make about them.
 *
 * A viewer who may also change somebody's competencies gets a "Grant
 * competency" button, which gives them one and authorises it here in one
 * step. That grant applies everywhere the person works, so it is kept to
 * a modal that says so, apart from the switches, which reach only here.
 *
 * Shared by the organisation and site pages: both are org_units, and
 * nothing here depends on which kind.
 */

import { useMemo, useState } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { BodyText, Heading } from "@/components/typography";
import { ConfirmModal } from "@/components/confirm-modal";
import AddButton from "@/components/button/AddButton";
import IconButton from "@/components/button/IconButton";
import Icon from "@/components/icons/Icon";
import { IconTrash } from "@/components/icons/appIcons";
import { SolidSwitch } from "@/components/form";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import type { MemberPractice } from "@/domains/orgUnit";
import { ACTIVE_COMPETENCIES, ALL_COMPETENCIES } from "@/types/cbac";
import GrantCompetencyModal from "./GrantCompetencyModal";

/** Props for {@link MemberPracticePanel}. */
export interface MemberPracticePanelProps {
  /** The member, their ceiling and what is authorised for them here. */
  practice: MemberPractice;
  /** Authorise a competency they hold at this org_unit. */
  onAuthorise: (competency: string) => Promise<void>;
  /** Stop them practising a competency at this org_unit. */
  onWithdraw: (competency: string) => Promise<void>;
  /** Give them a competency and authorise it here. */
  onGrantAndAuthorise: (competency: string) => Promise<void>;
}

/** One row in either table: a competency and its name. */
interface CompetencyRow {
  id: string;
  name: string;
}

/** What a competency id is called, or the id when it is unknown. */
function competencyName(id: string): string {
  return ALL_COMPETENCIES.find((entry) => entry.id === id)?.display_name ?? id;
}

/** Rows for *ids*, sorted by name so a long list reads alphabetically. */
function rowsFor(ids: Iterable<string>): CompetencyRow[] {
  return [...ids]
    .map((id) => ({ id, name: competencyName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Switch practice here on and off for each competency somebody holds.
 *
 * @param props - Component props
 * @returns The panel
 */
export default function MemberPracticePanel({
  practice,
  onAuthorise,
  onWithdraw,
  onGrantAndAuthorise,
}: MemberPracticePanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<CompetencyRow | null>(null);
  // Undefined while closed; otherwise the competency to start with, if any.
  const [granting, setGranting] = useState<string | null | undefined>(
    undefined,
  );

  const name = practice.full_name || practice.username;

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
          (id) => !qualifiedIds.has(id),
        ),
      ),
    [qualifiedIds],
  );

  async function toggle(row: CompetencyRow, on: boolean) {
    if (!on) {
      // Withdrawal has no undo, so it asks first.
      setWithdrawing(row);
      return;
    }
    setBusy(row.id);
    try {
      await onAuthorise(row.id);
    } finally {
      setBusy(null);
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
      width: "160px",
      render: (row) => (
        <SolidSwitch
          checked={authorisedIds.has(row.id)}
          disabled={busy !== null}
          onChange={(event) => void toggle(row, event.currentTarget.checked)}
          aria-label={`${row.name}: may practise here`}
        />
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
      render: (row) => (
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
      <BaseCard>
        <DataTableControlled<CompetencyRow>
          data={qualified}
          columns={qualifiedColumns}
          getRowKey={(row) => row.id}
          emptyMessage="They hold no competencies yet"
          searchFields={(row) => [row.name]}
          action={
            practice.may_grant && (
              <AddButton
                label="Grant competency"
                onClick={() => setGranting(null)}
              />
            )
          }
        />
      </BaseCard>

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
