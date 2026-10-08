/**
 * Passport Sign-offs Page
 *
 * Every sign-off the holder has asked for, one row each, grouped by where
 * it stands. Each opens on a page of its own.
 *
 * **This is the holder's own record, not an assessor's queue.** What
 * somebody has been asked to judge for other people lives apart, and
 * deliberately so: an external assessor may have a queue and no passport
 * at all. See the plan's note on naming that queue.
 *
 * **One row per sign-off, not per competency.** This page used to group
 * the passport's competency list, which carries only each competency's
 * latest sign-off. A competency declined and then signed off showed as
 * one row, the declined request was not shown anywhere, and a competency
 * with only a logbook entry sat under "Awaiting sign-off" when nobody
 * had been asked. It now reads `fetchSignOffs`, every sign-off in full.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { useEffect, useState } from "react";
import { Group, Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import CompetencyPicker from "@/components/passport/CompetencyPicker";
import SignOffList from "@/components/passport/SignOffList";
import SignOffRequestForm from "@/components/passport/SignOffRequestForm";
import ErrorState from "@/components/error-state/ErrorState";
import ResultMessage from "@/components/message-cards/ResultMessage";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import competenciesData from "@/generated/competencies.json";
import { fetchMyPassport, fetchSignOffs, requestSignOff } from "@lib/passport";
// Direct, not through the barrel, so page tests that mock the API
// client still get the real catalogue.
import { levelsFor } from "@lib/passport/levels";
import { scopesFor } from "@lib/passport/scopes";
import type {
  CompetencyState,
  SignOff,
  SignOffRequestInput,
  SignOffStatus,
} from "@lib/passport";

/**
 * A competency as the request form wants it, built from the catalogue.
 *
 * The form shows the competency's name while asking about it, but a
 * holder may be requesting a sign-off for something with nothing
 * recorded against it yet - which is how a competency first reaches a
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
 * Superseded last, under its own heading: a sign-off an assessor later
 * corrected is still part of the record, but it is not what the holder
 * is signed off for, so it sits apart from the live ones.
 */
const GROUPS: { status: SignOffStatus; title: string }[] = [
  { status: "requested", title: "Awaiting sign-off" },
  { status: "signed_off", title: "Signed off" },
  { status: "declined", title: "Declined" },
  { status: "superseded", title: "Replaced by a correction" },
];

export function Component() {
  const navigate = useNavigate();
  const { state } = useAuth();
  // The passport's competencies, which the request form reads to name
  // one it already knows. Never listed: the rows below are sign-offs.
  const [competencies, setCompetencies] = useState<CompetencyState[]>([]);
  const [signOffs, setSignOffs] = useState<SignOff[]>([]);
  const [passportId, setPassportId] = useState<string | null>(null);
  // The passport could not be loaded, so there is no page to show.
  const [error, setError] = useState<string | null>(null);
  // Set once the passport has arrived. Until then the page cannot tell an
  // empty passport from one still loading, and saying "nothing yet"
  // before the answer flashed the empty message over a full passport.
  const [loaded, setLoaded] = useState(false);
  // One ask was refused. Everything else on the page is fine, and the
  // holder needs the form they filled in to still be there.
  const [refusal, setRefusal] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Read from the passport this page already fetches. Asking for a
  // sign-off goes through `_require_writer`, the same gate as adding a
  // logbook entry, so the button has to answer the same question.
  const [canWrite, setCanWrite] = useState(true);
  // The frameworks the holder works to, which are what the picker lists.
  const [frameworks, setFrameworks] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (cancelled) return;
        const id = detail.passport.passport_id;
        setCompetencies(detail.competencies);
        setPassportId(id);
        setFrameworks(
          (detail.passport.frameworks ?? []).map((framework) => framework.id),
        );
        setCanWrite(detail.entitlement?.can_write !== false);
        return fetchSignOffs(id);
      })
      .then((result) => {
        if (cancelled || !result) return;
        setSignOffs(result);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your sign-offs could not be loaded. Please try again.");
        }
      });

    // The page no longer reads the user list. An assessor is named by
    // email, so there is nothing to offer and nothing to look up -
    // which also means asking for a sign-off no longer requires the
    // holder to fetch every user on the platform.

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRequest(data: SignOffRequestInput) {
    if (passportId === null || chosen === null) return;

    setSubmitting(true);
    try {
      await requestSignOff(passportId, chosen, data);
      const [detail, listed] = await Promise.all([
        fetchMyPassport(),
        fetchSignOffs(passportId),
      ]);
      setCompetencies(detail.competencies);
      setSignOffs(listed);
      setAsking(false);
      setChosen(null);
      setRefusal(null);
    } catch (caught) {
      // The server's own words where it gave any. It refuses some asks
      // for reasons a holder can act on - naming yourself, a competency
      // that does not exist, too many in a day - and "please try again"
      // both hides the reason and invites retrying something that will
      // never work. The api client has already lifted FastAPI's detail
      // into the message.
      const said = caught instanceof Error ? caught.message.trim() : "";
      setRefusal(
        said !== "" ? said : "The request could not be sent. Please try again.",
      );
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

  const hasAny = signOffs.length > 0;

  return (
    <Stack gap="lg">
      <PageHeader title="Sign-offs" />

      {/* A refused ask, said where the asking happened. Not ErrorState:
          that replaces the view, which would throw away the form and
          the competency already chosen, and its "Something went wrong"
          heading overstates a rule working exactly as intended. */}
      {refusal !== null && <ResultMessage variant="warning" title={refusal} />}

      {/* Above the groups, because asking is what a holder came here to
          do. The picker offers the whole catalogue rather than only
          what is listed below: a sign-off can be asked for against a
          competency with nothing recorded yet, and that is often how
          one first reaches a passport. */}
      {asking ? (
        <Stack gap="lg">
          <CompetencyPicker
            frameworks={frameworks}
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
              levels={levelsFor(chosen)}
              scopes={scopesFor(chosen)}
              holderEmail={state.user?.email}
              holderUsername={state.user?.username}
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
            disabled={!canWrite}
          />
        </Group>
      )}

      {/* Below the add button, as on every passport page, and before
          the groups, so a holder with nothing yet is told how a
          sign-off comes about rather than reading three empty lists.
          Held back until the fetch returns: shown any earlier, it
          flashed over a passport that did have sign-offs. */}
      {loaded && !hasAny && (
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="No sign-offs yet"
          description="Start a sign-off request to have an assessor review a competency."
        />
      )}

      {/* Until the fetch returns, so the page is not blank under the
          button while a passport full of sign-offs is on its way. */}
      {!loaded && <SignOffList title="Sign-offs" signOffs={[]} isLoading />}

      {/* An empty group renders nothing, so only the groups with
          sign-offs in them appear. */}
      {GROUPS.map((group) => (
        <SignOffList
          key={group.status}
          title={group.title}
          signOffs={signOffs.filter(
            (signOff) => signOff.status === group.status,
          )}
          onSelect={(name) =>
            navigate(`/passport/sign-offs/${encodeURIComponent(name)}`)
          }
        />
      ))}
    </Stack>
  );
}
