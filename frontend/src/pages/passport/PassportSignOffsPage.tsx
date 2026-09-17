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
import { Group, Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import CompetencyPicker from "@/components/passport/CompetencyPicker";
import CompetencySummary from "@/components/passport/CompetencySummary";
import SignOffRequestForm from "@/components/passport/SignOffRequestForm";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import { api } from "@/lib/api";
import competenciesData from "@/generated/competencies.json";
import { fetchMyPassport, requestSignOff } from "@lib/passport";
import type {
  CompetencyState,
  SignOffRequestInput,
  SignOffStatus,
} from "@lib/passport";

/** Shape of the user records the assessor list is built from. */
interface ApiUser {
  id: number;
  username: string;
}

/**
 * A competency as the request form wants it, built from the catalogue.
 *
 * The form shows the competency's name while asking about it, but a
 * holder may be requesting a sign-off for something with nothing
 * recorded against it yet — which is how a competency first reaches a
 * passport at all. So where the passport already knows it, that entry is
 * used; otherwise the name comes from the shared catalogue, the same
 * source the picker reads, and the rest describes an empty history.
 */
function competencyForForm(
  competencyId: string,
  known: CompetencyState[],
): CompetencyState {
  const existing = known.find((entry) => entry.id === competencyId);
  if (existing) return existing;

  const catalogue = competenciesData.competencies as {
    id: string;
    display_name: string;
  }[];
  const entry = catalogue.find((item) => item.id === competencyId);

  return {
    id: competencyId,
    name: entry?.display_name ?? competencyId,
    status: "requested",
    level: null,
    signed_on: null,
    signed_off_by: null,
    expires_on: null,
    sign_off: null,
    previous_sign_offs: [],
    logbook_entries: 0,
    certificates: [],
  };
}

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
  const [passportId, setPassportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assessors, setAssessors] = useState<
    { value: string; label: string }[]
  >([]);
  const [asking, setAsking] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (cancelled) return;
        setCompetencies(detail.competencies);
        setPassportId(detail.passport.passport_id);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your sign-offs could not be loaded. Please try again.");
        }
      });

    // There is no passport endpoint listing assessors, so the page asks
    // for users directly and the form stays presentational — the same
    // arrangement the competency page uses.
    api
      .get<{ users: ApiUser[] }>("/users")
      .then(({ users }) => {
        if (cancelled) return;
        setAssessors(
          users.map((user) => ({
            value: String(user.id),
            label: user.username,
          })),
        );
      })
      .catch(() => {
        // Not fatal: the rest of the page still reads, and the form
        // simply has nobody to offer.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRequest(data: SignOffRequestInput) {
    if (passportId === null || chosen === null) return;

    setSubmitting(true);
    try {
      await requestSignOff(passportId, chosen, data);
      setCompetencies((await fetchMyPassport()).competencies);
      setAsking(false);
      setChosen(null);
      setError(null);
    } catch {
      setError("The request could not be sent. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
          sign-off comes about rather than reading three empty lists.
          Not held back until the fetch returns: the words are the same
          either way, so waiting only made the panel appear late. */}
      {!hasAny && (
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="Nothing recorded yet"
          description="A competency appears here once you have recorded something against it — a logbook entry, a certificate or a CPD activity — and asked an assessor to sign it off."
        />
      )}

      {/* Above the groups, because asking is what a holder came here to
          do. The picker offers the whole catalogue rather than only
          what is listed below: a sign-off can be asked for against a
          competency with nothing recorded yet, and that is often how
          one first reaches a passport. */}
      {asking ? (
        <Stack gap="lg">
          <CompetencyPicker
            value={chosen}
            onChange={setChosen}
            label="Which competency?"
            description="What you are asking to be signed off for."
          />

          {/* Only once a competency is chosen: the form names it in its
              heading and cannot be filled in without it. Until then the
              picker stands alone, with the same button that opened it
              offering the way back out. */}
          {chosen && (
            <SignOffRequestForm
              competency={competencyForForm(chosen, competencies)}
              assessors={assessors}
              onSubmit={handleRequest}
              onCancel={() => {
                setAsking(false);
                setChosen(null);
              }}
              isSubmitting={submitting}
            />
          )}
        </Stack>
      ) : (
        <Group justify="flex-end">
          <AddButton
            label="Ask for a sign-off"
            onClick={() => setAsking(true)}
          />
        </Group>
      )}

      {hasAny &&
        GROUPS.map((group) => {
          const inGroup = competencies.filter(
            (competency) => competency.status === group.status,
          );

          // An empty group is left out rather than shown as a heading
          // over nothing. While loading every group is empty, so the
          // page draws no groups at all until the answer arrives —
          // which is right: a heading with nothing under it says less
          // than no heading.
          if (inGroup.length === 0) return null;

          return (
            <CompetencySummary
              key={group.status}
              title={group.title}
              competencies={inGroup}
              // A logbook entry is evidence towards a competency, not
              // something an assessor signs. Counting them here, beside
              // a sign-off status, read as though they were part of it.
              showLogbookCount={false}
              onSelect={(competencyId) =>
                navigate(`/passport/competency/${competencyId}`)
              }
            />
          );
        })}
    </Stack>
  );
}
