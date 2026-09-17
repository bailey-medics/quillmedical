/**
 * Passport Logbook Page
 *
 * A competency's logbook, chosen with the picker.
 *
 * The competency is chosen here rather than taken from the route,
 * because a holder browsing their logbook thinks in terms of "show me my
 * bronchoscopies" rather than in terms of a URL.
 */

import { useEffect, useState } from "react";
import { Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import CompetencyPicker from "@/components/passport/CompetencyPicker";
import LogbookEntryForm from "@/components/passport/LogbookEntryForm";
import LogbookTable from "@/components/passport/LogbookTable";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import competenciesData from "@/generated/competencies.json";
import { addLogbookEntry, fetchLogbook, fetchMyPassport } from "@lib/passport";
import type {
  CompetencyState,
  Logbook,
  LogbookEntryInput,
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
  const [competencyId, setCompetencyId] = useState<string | null>(null);
  const [logbook, setLogbook] = useState<Logbook | null>(null);
  // Which competency the current logbook belongs to. Loading is then
  // derived rather than set in the effect body: a chosen competency with
  // no logbook loaded for it yet is exactly what "loading" means.
  const [loadedFor, setLoaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (!cancelled) setPassportId(detail.passport.passport_id);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your passport could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (passportId === null || competencyId === null) return;

    let cancelled = false;

    fetchLogbook(passportId, competencyId)
      .then((result) => {
        if (!cancelled) setLogbook(result);
      })
      .catch(() => {
        if (!cancelled) {
          setError("That logbook could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(competencyId);
      });

    return () => {
      cancelled = true;
    };
  }, [passportId, competencyId]);

  async function handleSubmit(data: LogbookEntryInput) {
    if (passportId === null || competencyId === null) return;

    setSubmitting(true);
    try {
      await addLogbookEntry(passportId, competencyId, data);
      setLogbook(await fetchLogbook(passportId, competencyId));
      setAdding(false);
      setError(null);
    } catch {
      setError("That entry could not be saved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Logbook" />

      {error && <ErrorState message={error} />}

      {/* Above the picker rather than below it, so the instruction is
          read before the control it refers to — hence "below" rather
          than the "above" it said while it sat underneath. */}
      {!(competencyId && logbook) && (
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="Choose a competency"
          description="Pick one below to see the procedures you have logged against it."
        />
      )}

      <CompetencyPicker
        value={competencyId}
        onChange={setCompetencyId}
        label="Which competency?"
        description="Your entries are grouped by the competency they count towards."
      />

      {/* Only once a competency is chosen: an entry counts towards one,
          so there is nothing to record until the page knows which. */}
      {competencyId &&
        (adding ? (
          <LogbookEntryForm
            competency={competencyForForm(competencyId, logbook)}
            onSubmit={handleSubmit}
            onCancel={() => setAdding(false)}
            isSubmitting={submitting}
          />
        ) : (
          <Group justify="flex-end">
            <AddButton label="Add an entry" onClick={() => setAdding(true)} />
          </Group>
        ))}

      {competencyId && logbook && (
        <LogbookTable
          logbook={logbook}
          isLoading={loadedFor !== competencyId}
        />
      )}
    </Stack>
  );
}
