/**
 * Who may practise what at one org_unit.
 *
 * Two facts are kept apart across the whole model, and this card shows
 * the second. What somebody is qualified for lives on them, earned
 * through training and sign-off. Where they may exercise it is a row
 * per person, org_unit and competency, and only that second half is an
 * organisation's to decide.
 *
 * **Nothing is inherited.** A row at a trust says nothing about its
 * wards, so this lists what is authorised at this org_unit and nowhere
 * else. That is the property the model turns on, and the reason the
 * card belongs on every org_unit's page rather than only at the top of
 * a tree.
 *
 * Withdrawal confirms first, because it removes somebody's
 * authorisation to work and there is no undo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Group, Select, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { Heading } from "@/components/typography";
import { ConfirmModal } from "@/components/confirm-modal";
import AddButton from "@/components/button/AddButton";
import IconButton from "@/components/button/IconButton";
import Icon from "@/components/icons/Icon";
import { IconTrash } from "@tabler/icons-react";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import { orgUnits } from "@/domains/orgUnit";
import type { OrgUnitMember, PractisingCompetency } from "@/domains/orgUnit";
import { ACTIVE_COMPETENCIES } from "@/types/cbac";
import { useHasCompetency } from "@/lib/cbac/hooks";

/** Props for {@link PractisingCompetenciesCard}. */
export interface PractisingCompetenciesCardProps {
  /** The org_unit whose authorisations these are. */
  orgUnitId: number;
  /**
   * Who is at this org_unit, offered as the people to authorise.
   *
   * Passed in rather than fetched, because the page showing this card
   * has already loaded them and a second request would say the same
   * thing.
   */
  members: OrgUnitMember[];
  /** Called after a change, so the page can say what happened. */
  onChanged?: (message: string) => void;
  /** Called when a request fails, with a message worth showing. */
  onError?: (message: string) => void;
}

/** What a competency id is called, or the id when it is unknown. */
function competencyLabel(id: string): string {
  const match = ACTIVE_COMPETENCIES.find((competency) => competency.id === id);
  return match?.display_name ?? id;
}

/**
 * List, authorise and withdraw practice at one org_unit.
 *
 * @param props - Component props
 * @returns The card, or nothing when the viewer may not manage these
 */
export default function PractisingCompetenciesCard({
  orgUnitId,
  members,
  onChanged,
  onError,
}: PractisingCompetenciesCardProps) {
  const mayManage = useHasCompetency("manage_practising_competencies");

  // null until the first answer arrives, which is what tells an empty
  // org_unit apart from one still being read.
  const [rows, setRows] = useState<PractisingCompetency[] | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [competency, setCompetency] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<PractisingCompetency | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      setRows(await orgUnits.practisingCompetencies(orgUnitId));
    } catch {
      setRows([]);
      onError?.("Could not load who may practise here.");
    }
  }, [orgUnitId, onError]);

  useEffect(() => {
    if (!mayManage) return;
    // Deferred rather than called straight, so no state is set while the
    // effect body runs. Matches `OrganisationAdminPage`: the lint rule
    // analyses one function at a time and cannot see that `load` awaits
    // before touching state, so the wrapper makes the deferral explicit,
    // and the floating promise with it.
    void (async () => {
      await load();
    })();
  }, [mayManage, load]);

  const peopleOptions = useMemo(
    () =>
      members.map((member) => ({
        value: String(member.id),
        label: member.full_name || member.username,
      })),
    [members],
  );

  const competencyOptions = useMemo(
    () =>
      ACTIVE_COMPETENCIES.map((entry) => ({
        value: entry.id,
        label: entry.display_name,
      })),
    [],
  );

  const authorise = useCallback(async () => {
    if (!person || !competency) return;
    try {
      await orgUnits.authorisePractising(orgUnitId, {
        user_id: Number(person),
        competency,
      });
      setPerson(null);
      setCompetency(null);
      await load();
      onChanged?.("Authorised.");
    } catch {
      onError?.("Could not authorise that.");
    }
  }, [person, competency, orgUnitId, load, onChanged, onError]);

  const confirmWithdraw = useCallback(async () => {
    if (!withdrawing) return;
    try {
      await orgUnits.withdrawPractising(
        orgUnitId,
        withdrawing.user_id,
        withdrawing.competency,
      );
      setWithdrawing(null);
      await load();
      onChanged?.("Withdrawn.");
    } catch {
      onError?.("Could not withdraw that.");
    }
  }, [withdrawing, orgUnitId, load, onChanged, onError]);

  const columns: Column<PractisingCompetency>[] = [
    {
      header: "Person",
      render: (row) => row.full_name || row.username,
      accessor: (row) => row.full_name || row.username,
    },
    {
      header: "May practise",
      render: (row) => competencyLabel(row.competency),
      accessor: (row) => competencyLabel(row.competency),
    },
    {
      header: "",
      width: "50px",
      render: (row) => (
        <IconButton
          icon={<Icon icon={<IconTrash />} />}
          onClick={() => setWithdrawing(row)}
          aria-label={`Withdraw ${competencyLabel(row.competency)} from ${
            row.full_name || row.username
          }`}
        />
      ),
    },
  ];

  // Nothing at all rather than an empty card: somebody who may not
  // manage these has no use for the heading either.
  if (!mayManage) return null;

  return (
    <BaseCard>
      <Stack gap="md">
        <Heading>Who may practise here</Heading>

        <Group align="flex-end" gap="sm">
          <Select
            label="Person"
            placeholder="Choose somebody"
            data={peopleOptions}
            value={person}
            onChange={setPerson}
            searchable
          />
          <Select
            label="Competency"
            placeholder="Choose a competency"
            data={competencyOptions}
            value={competency}
            onChange={setCompetency}
            searchable
          />
          <AddButton
            label="Authorise"
            onClick={() => void authorise()}
            disabled={!person || !competency}
          />
        </Group>

        <DataTableControlled<PractisingCompetency>
          data={rows ?? []}
          columns={columns}
          getRowKey={(row) => `${row.user_id}-${row.competency}`}
          emptyMessage={
            rows === null
              ? "Loading…"
              : "Nobody is authorised to practise here yet"
          }
          searchFields={(row) => [
            row.full_name,
            row.username,
            competencyLabel(row.competency),
          ]}
        />
      </Stack>

      <ConfirmModal
        opened={withdrawing !== null}
        onClose={() => setWithdrawing(null)}
        onAccept={confirmWithdraw}
        title="Withdraw authorisation"
        acceptLabel="Withdraw"
        submittingLabel="Withdrawing…"
      >
        Are you sure you want to stop{" "}
        <strong>{withdrawing?.full_name || withdrawing?.username}</strong>{" "}
        practising{" "}
        <strong>
          {withdrawing ? competencyLabel(withdrawing.competency) : ""}
        </strong>{" "}
        here? They stay qualified, and stay authorised anywhere else.
      </ConfirmModal>
    </BaseCard>
  );
}
