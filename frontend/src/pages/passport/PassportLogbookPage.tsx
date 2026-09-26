/**
 * Passport Logbook Page
 *
 * Everything logged, narrowed by a filter, with a picker for adding.
 *
 * The two were one control until a read-only holder needed the first
 * and could not be given the second. Narrowing the view is reading, and
 * a holder whose entitlement has ended keeps every read; choosing what
 * an entry counts towards is writing, and they have lost that. One
 * control cannot be both enabled and disabled, so there are two.
 *
 * The filter is `FilterSelect`, the same component the tables use, so
 * narrowing a logbook looks like narrowing any other list. The picker
 * is `CompetencyPicker`, and it appears only while an entry is being
 * written, because that is the only moment it is asked anything.
 */

import { useEffect, useMemo, useState } from "react";
import { Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import CompetencyPicker from "@/components/passport/CompetencyPicker";
import FilterSelect from "@/components/form/FilterSelect";
import LogbookEntryForm from "@/components/passport/LogbookEntryForm";
import LogbookTable from "@/components/passport/LogbookTable";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import competenciesData from "@/generated/competencies.json";
import {
  addLogbookEntry,
  fetchMyPassport,
  fetchWholeLogbook,
} from "@lib/passport";
import type {
  CompetencyState,
  Logbook,
  LogbookEntryInput,
  WholeLogbook,
} from "@lib/passport";

/**
 * A competency as the entry form wants it, built from the catalogue.
 *
 * The form takes the whole `CompetencyState` because it shows what is
 * already recorded, but a competency being logged against for the first
 * time has no state yet — it is not on the passport until this entry
 * puts it there. So the name comes from the shared catalogue, the same
 * source the picker reads, and the rest describes an empty history
 * rather than pretending to know one.
 */
function competencyForForm(
  competencyId: string,
  logbook: Logbook | null,
): CompetencyState {
  const catalogue = competenciesData.competencies as {
    id: string;
    display_name: string;
  }[];
  const entry = catalogue.find((item) => item.id === competencyId);

  return {
    id: competencyId,
    name: entry?.display_name ?? competencyId,
    // The form reads only the name; the rest describes a competency
    // with nothing recorded against it, which is the honest state for
    // one being logged against for the first time.
    status: "requested",
    level: null,
    signed_on: null,
    signed_off_by: null,
    expires_on: null,
    sign_off: null,
    previous_sign_offs: [],
    logbook_entries: logbook?.count ?? 0,
    certificates: [],
  };
}

export function Component() {
  const [passportId, setPassportId] = useState<string | null>(null);
  // What the view is narrowed to. Empty means everything, which is what
  // a holder opening their logbook wants to see first.
  const [shown, setShown] = useState<string[]>([]);
  // What a new entry would count towards. Only ever set while the form
  // is open, and never used to narrow the view.
  const [competencyId, setCompetencyId] = useState<string | null>(null);
  const [whole, setWhole] = useState<WholeLogbook>({
    competencies: [],
    count: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Read from the passport this page already fetches, rather than
  // asking again. False only where the server said so, so a response
  // built before the field existed still offers the button.
  const [canWrite, setCanWrite] = useState(true);
  // The holder's specialties, which order the competency picker.
  const [specialties, setSpecialties] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        const id = detail.passport.passport_id;
        if (cancelled) return;
        setPassportId(id);
        setSpecialties(
          (detail.passport.specialties ?? []).map((specialty) => specialty.id),
        );
        setCanWrite(detail.entitlement?.can_write !== false);
        return fetchWholeLogbook(id);
      })
      .then((result) => {
        if (!cancelled && result) setWhole(result);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your logbook could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(data: LogbookEntryInput) {
    if (passportId === null || competencyId === null) return;

    setSubmitting(true);
    try {
      await addLogbookEntry(passportId, competencyId, data);
      setWhole(await fetchWholeLogbook(passportId));
      setAdding(false);
      setError(null);
    } catch {
      setError("That entry could not be saved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Everything logged, narrowed by the filter. Empty shows the lot.
  const groups =
    shown.length > 0
      ? whole.competencies.filter((group) => shown.includes(group.competency))
      : whole.competencies;

  // One option per competency already in the logbook, named from the
  // catalogue. Built from what is there rather than from the whole
  // catalogue, because a filter offering competencies with nothing
  // behind them only ever produces an empty list.
  // Display names, from the shared catalogue. Used by the filter and by
  // each table's heading, which until now printed the raw id: the page
  // showed "certify_death" where the picker beside it said "Certify
  // death", and only the picker's wording was ever read by a test.
  const nameOf = useMemo(() => {
    const catalogue = competenciesData.competencies as {
      id: string;
      display_name: string;
    }[];
    const byId = new Map(catalogue.map((item) => [item.id, item.display_name]));
    return (id: string) => byId.get(id) ?? id;
  }, []);

  const filterOptions = useMemo(() => {
    const catalogue = competenciesData.competencies as {
      id: string;
      display_name: string;
    }[];
    return [
      {
        group: "Competency",
        items: whole.competencies.map((entry) => ({
          value: entry.competency,
          label:
            catalogue.find((item) => item.id === entry.competency)
              ?.display_name ?? entry.competency,
        })),
      },
    ];
  }, [whole.competencies]);

  return (
    <Stack gap="lg">
      <PageHeader title="Logbook" />

      {error && <ErrorState message={error} />}

      {whole.count === 0 && (
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="Nothing logged yet"
          description="Procedures you record appear here, grouped by the competency they count towards."
        />
      )}

      {/* Narrowing the view, which is reading. Offered whatever the
          entitlement says, and only where there is more than one
          competency to choose between. */}
      {whole.competencies.length > 1 && (
        <Group justify="flex-end">
          <FilterSelect
            data={filterOptions}
            value={shown}
            onChange={setShown}
            label="Competency"
            aria-label="Filter the logbook by competency"
          />
        </Group>
      )}

      {adding ? (
        <Stack gap="md">
          {/* Choosing what the entry counts towards, which is writing.
              Inside the form rather than above the page, because this
              is the only moment it is asked anything. */}
          <CompetencyPicker
            specialties={specialties}
            value={competencyId}
            onChange={setCompetencyId}
            label="Which competency?"
            description="The entry will count towards this one."
          />

          {competencyId && (
            <LogbookEntryForm
              competency={competencyForForm(competencyId, groups[0] ?? null)}
              onSubmit={handleSubmit}
              onCancel={() => {
                setAdding(false);
                setCompetencyId(null);
              }}
              isSubmitting={submitting}
            />
          )}
        </Stack>
      ) : (
        <Group justify="flex-end">
          {/* Disabled where the server says a write would be refused,
              rather than offering a control that fails on submit. */}
          <AddButton
            label="Add an entry"
            onClick={() => setAdding(true)}
            disabled={!canWrite}
          />
        </Group>
      )}

      {groups.map((group) => (
        <LogbookTable
          key={group.competency}
          logbook={group}
          competencyName={nameOf(group.competency)}
        />
      ))}
    </Stack>
  );
}
