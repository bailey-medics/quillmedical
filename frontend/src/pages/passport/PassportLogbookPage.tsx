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
import { Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import CompetencyPicker from "@/components/passport/CompetencyPicker";
import LogbookTable from "@/components/passport/LogbookTable";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import { fetchLogbook, fetchMyPassport } from "@lib/passport";
import type { Logbook } from "@lib/passport";

export function Component() {
  const [passportId, setPassportId] = useState<string | null>(null);
  const [competencyId, setCompetencyId] = useState<string | null>(null);
  const [logbook, setLogbook] = useState<Logbook | null>(null);
  // Which competency the current logbook belongs to. Loading is then
  // derived rather than set in the effect body: a chosen competency with
  // no logbook loaded for it yet is exactly what "loading" means.
  const [loadedFor, setLoaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      {competencyId && logbook && (
        <LogbookTable
          logbook={logbook}
          isLoading={loadedFor !== competencyId}
        />
      )}
    </Stack>
  );
}
