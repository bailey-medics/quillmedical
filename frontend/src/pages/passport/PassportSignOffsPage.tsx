/**
 * Passport Sign-offs Page
 *
 * Every competency the holder has evidence for, grouped by where its
 * sign-off stands.
 *
 * **This is the holder's own record, not an assessor's queue.** What
 * somebody has been asked to judge for other people lives apart, and
 * deliberately so: an external assessor may have a queue and no passport
 * at all. See the plan's note on naming that queue.
 *
 * Nothing is fetched that the passport page does not already fetch. A
 * competency's status is part of `fetchMyPassport`, so this page is a
 * grouping of what is already known rather than a new question asked of
 * the API.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import CompetencySummary from "@/components/passport/CompetencySummary";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import { fetchMyPassport } from "@lib/passport";
import type { CompetencyState, SignOffStatus } from "@lib/passport";

/**
 * The groups, in the order a holder cares about them.
 *
 * Awaiting first because it is the only one with anything outstanding:
 * somebody else is holding it, and a holder checking this page is
 * usually asking what has not come back yet. Signed off next, as the
 * record proper. Declined after that, because it is rare and reading it
 * first would make an ordinary passport look troubled.
 *
 * `superseded` is deliberately absent. A superseded sign-off has been
 * replaced by a newer one, so listing it beside the live record would
 * show the same competency twice and invite reading the stale half.
 */
const GROUPS: { status: SignOffStatus; title: string }[] = [
  { status: "requested", title: "Awaiting sign-off" },
  { status: "signed_off", title: "Signed off" },
  { status: "declined", title: "Declined" },
];

export function Component() {
  const navigate = useNavigate();
  const [competencies, setCompetencies] = useState<CompetencyState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (!cancelled) setCompetencies(detail.competencies);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your sign-offs could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Stack gap="lg">
        <PageHeader title="Sign-offs" />
        <ErrorState message={error} />
      </Stack>
    );
  }

  // What the page can actually show, not what the passport holds. A
  // competency whose only sign-off is superseded belongs to no group,
  // so counting it would suppress the empty state and leave the page
  // blank — headings gone, nothing in their place.
  const shown = competencies.filter((competency) =>
    GROUPS.some((group) => group.status === competency.status),
  );
  const hasAny = shown.length > 0;

  return (
    <Stack gap="lg">
      <PageHeader title="Sign-offs" />

      {/* Before the groups, so a holder with nothing yet is told how a
          sign-off comes about rather than reading three empty lists. */}
      {!loading && !hasAny && (
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="Nothing recorded yet"
          description="A competency appears here once you have recorded something against it — a logbook entry, a certificate or a CPD activity — and asked an assessor to sign it off."
        />
      )}

      {(loading || hasAny) &&
        GROUPS.map((group) => {
          const inGroup = competencies.filter(
            (competency) => competency.status === group.status,
          );

          // Every group is drawn as skeletons while loading, since
          // there is nothing yet to group by. Once loaded, an empty
          // group is left out rather than shown as a heading over
          // nothing.
          //
          // The two branches below look like one expression with
          // `isLoading={loading}` would do, and it does not: a caller
          // that finds a heading during the loading render then reads
          // the rest of the page in that same frame, and sees every
          // group still drawn. Returning early keeps the loaded page
          // free of empty headings whatever moment it is inspected.
          if (!loading && inGroup.length === 0) return null;

          if (loading) {
            return (
              <CompetencySummary
                key={group.status}
                title={group.title}
                competencies={[]}
                isLoading
              />
            );
          }

          return (
            <CompetencySummary
              key={group.status}
              title={group.title}
              competencies={inGroup}
              onSelect={(competencyId) =>
                navigate(`/passport/competency/${competencyId}`)
              }
            />
          );
        })}
    </Stack>
  );
}
