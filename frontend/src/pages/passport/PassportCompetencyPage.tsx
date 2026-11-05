/**
 * Passport Competency Page
 *
 * One competency in the holder's passport: its sign-offs and its logbook,
 * with a way to add to either. A row of the By competency view of the
 * passport opens this, at `/passport/competencies/:competencyId`.
 *
 * Fetches and hands what it fetched to `PassportCompetencyDetail`, which
 * Storybook draws from fixtures, so the story and the page show the same
 * thing.
 *
 * **Sign-offs come from the passport's list of every sign-off**, kept to
 * this competency. `GET /competencies/{competency_id}` carries only the
 * latest, and the page shows the history too.
 *
 * **Asking and adding open the existing forms with this competency
 * already chosen**, `SignOffRequestForm` and `LogbookEntryForm`, in place
 * of the competency's tables. The forms are the ones the Sign-offs and
 * Logbook pages use, so a request made here is the same request.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { useCallback, useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import PageHeader from "@/components/page-header";
import ErrorState from "@/components/error-state/ErrorState";
import ResultMessage from "@/components/message-cards/ResultMessage";
import { PageSpinner } from "@/components/loading-spinner";
import LogbookEntryForm from "@/components/passport/LogbookEntryForm";
import PassportCompetencyDetail from "@/components/passport/PassportCompetencyDetail";
import SignOffRequestForm from "@/components/passport/SignOffRequestForm";
import { useFrameworkCatalogue } from "@lib/passport/catalogue";
import {
  addLogbookEntry,
  fetchLogbook,
  fetchMyPassport,
  fetchSignOffs,
  requestSignOff,
} from "@lib/passport";
// Direct, not through the barrel, so page tests that mock the API
// client still get the real catalogue.
import { levelsFor } from "@lib/passport/levels";
import { scopesFor } from "@lib/passport/scopes";
import type {
  CompetencyState,
  Logbook,
  LogbookEntryInput,
  SignOff,
  SignOffRequestInput,
} from "@lib/passport";

/** What the page is showing: the competency, or one of the two forms. */
type Mode = "view" | "asking" | "adding";

/** What the page fetched, once it has. */
interface Loaded {
  passportId: string;
  canWrite: boolean;
  /** The passport's entry for this competency, if it has one yet */
  state: CompetencyState | undefined;
  signOffs: SignOff[];
  logbook: Logbook;
}

/**
 * The competency as both forms want it. Where the passport already holds
 * evidence for it, that entry; otherwise an empty history under the
 * catalogue's name, which is the honest state of one nothing has been
 * recorded against yet.
 */
function competencyForForm(
  id: string,
  name: string,
  loaded: Loaded,
): CompetencyState {
  return (
    loaded.state ?? {
      id,
      name,
      status: "requested",
      level: null,
      signed_on: null,
      signed_off_by: null,
      expires_on: null,
      sign_off: null,
      previous_sign_offs: [],
      logbook_entries: loaded.logbook.count,
      certificates: [],
    }
  );
}

/** The server's own words where it gave any, or a general message. */
function refusalFrom(caught: unknown, fallback: string): string {
  const said = caught instanceof Error ? caught.message.trim() : "";

  return said !== "" ? said : fallback;
}

export function Component() {
  const { catalogue, failed: catalogueFailed } = useFrameworkCatalogue();
  const navigate = useNavigate();
  const { state: auth } = useAuth();
  const { competencyId = "" } = useParams<{ competencyId: string }>();

  // Only a framework competency Quill holds has a page. Anything else is
  // an address nobody was given, so it is not found rather than an empty
  // page. A retired one still has its page, read-only, for what is
  // recorded against it: nothing new can be asked for or logged.
  const competency = catalogue?.competency(competencyId);
  const retired = competency?.retired_on !== undefined;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [submitting, setSubmitting] = useState(false);
  // One ask or entry was refused. The form stays open with what was
  // filled in, and the reason is said above it.
  const [refusal, setRefusal] = useState<string | null>(null);

  const load = useCallback(async (): Promise<Loaded> => {
    const detail = await fetchMyPassport();
    const passportId = detail.passport.passport_id;
    const [signOffs, logbook] = await Promise.all([
      fetchSignOffs(passportId),
      fetchLogbook(passportId, competencyId),
    ]);

    return {
      passportId,
      // False only where the server said so, as on the other passport
      // pages, so a response built before the field existed still
      // offers the buttons.
      canWrite: detail.entitlement?.can_write !== false,
      state: detail.competencies.find((entry) => entry.id === competencyId),
      signOffs: signOffs.filter(
        (signOff) => signOff.competency.id === competencyId,
      ),
      logbook,
    };
  }, [competencyId]);

  useEffect(() => {
    if (!competency) return;

    let cancelled = false;

    load()
      .then((result) => {
        if (!cancelled) setLoaded(result);
      })
      .catch(() => {
        if (!cancelled) {
          setError("This competency could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [competency, load]);

  async function handleRequest(data: SignOffRequestInput) {
    if (loaded === null) return;

    setSubmitting(true);
    try {
      await requestSignOff(loaded.passportId, competencyId, data);
      setLoaded(await load());
      setMode("view");
      setRefusal(null);
    } catch (caught) {
      setRefusal(
        refusalFrom(caught, "The request could not be sent. Please try again."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddEntry(data: LogbookEntryInput) {
    if (loaded === null) return;

    setSubmitting(true);
    try {
      await addLogbookEntry(loaded.passportId, competencyId, data);
      setLoaded(await load());
      setMode("view");
      setRefusal(null);
    } catch (caught) {
      setRefusal(
        refusalFrom(caught, "That entry could not be saved. Please try again."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function cancel() {
    setMode("view");
    setRefusal(null);
  }

  // The frameworks are still loading, so whether this is a competency
  // Quill holds is not known yet.
  if (catalogue === null && !catalogueFailed) return <PageSpinner />;

  if (!competency) {
    return (
      <Stack gap="lg">
        <PageHeader title="Competency" />
        <ErrorState message="This competency could not be found." />
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack gap="lg">
        <PageHeader title={competency.display_name} />
        <ErrorState message={error} />
      </Stack>
    );
  }

  if (loaded === null) return <PageSpinner />;

  const formCompetency = competencyForForm(
    competencyId,
    competency.display_name,
    loaded,
  );

  if (mode !== "view") {
    return (
      <Stack gap="lg">
        <PageHeader title={competency.display_name} />

        {refusal !== null && (
          <ResultMessage variant="warning" title={refusal} />
        )}

        {mode === "asking" ? (
          <SignOffRequestForm
            competency={formCompetency}
            levels={levelsFor(catalogue, competencyId)}
            scopes={scopesFor(catalogue, competencyId)}
            holderEmail={auth.user?.email}
            holderUsername={auth.user?.username}
            onSubmit={handleRequest}
            onCancel={cancel}
            isSubmitting={submitting}
          />
        ) : (
          <LogbookEntryForm
            competency={formCompetency}
            scopes={scopesFor(catalogue, competencyId)}
            onSubmit={handleAddEntry}
            onCancel={cancel}
            isSubmitting={submitting}
          />
        )}
      </Stack>
    );
  }

  return (
    <PassportCompetencyDetail
      competency={{ id: competencyId, name: competency.display_name }}
      frameworkName={catalogue?.frameworkOf(competencyId)?.name}
      signOffs={loaded.signOffs}
      logbook={loaded.logbook}
      canWrite={loaded.canWrite && !retired}
      onAskForSignOff={() => setMode("asking")}
      onAddEntry={() => setMode("adding")}
      onSelectSignOff={(name) =>
        navigate(`/passport/sign-offs/${encodeURIComponent(name)}`)
      }
      onSelectEntry={(entry) =>
        navigate(
          `/passport/logbook/${encodeURIComponent(competencyId)}/${encodeURIComponent(entry.filename)}`,
        )
      }
    />
  );
}
