/**
 * Passport Competency Page
 *
 * One competency's history: its sign-offs in full, and the form for
 * requesting a new one.
 *
 * The assessor is named by email on the form, so this page fetches
 * nothing but the passport itself. It used to read `/users` to fill a
 * dropdown, which meant asking for a sign-off required the holder to
 * pull the whole user list.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import PageHeader from "@/components/page-header";
import SignOffRequestForm from "@/components/passport/SignOffRequestForm";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import AddButton from "@/components/button/AddButton";
import { fetchMyPassport, requestSignOff } from "@lib/passport";
import type {
  CompetencyState,
  PassportDetail,
  SignOffRequestInput,
} from "@lib/passport";

export function Component() {
  const { id: competencyId } = useParams<{ id: string }>();
  const { state } = useAuth();
  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (!cancelled) setPassport(detail);
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

  const competency: CompetencyState | undefined = passport?.competencies.find(
    (entry) => entry.id === competencyId,
  );

  async function handleRequest(data: SignOffRequestInput) {
    if (!passport || !competencyId) return;

    setSubmitting(true);
    try {
      await requestSignOff(passport.passport.passport_id, competencyId, data);
      setPassport(await fetchMyPassport());
      setRequesting(false);
      setError(null);
    } catch {
      setError("The request could not be sent. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader title={competency?.name ?? "Competency"} />

      {error && <ErrorState message={error} />}

      {competency && requesting ? (
        <SignOffRequestForm
          competency={competency}
          holderEmail={state.user?.email}
          holderUsername={state.user?.username}
          onSubmit={handleRequest}
          onCancel={() => setRequesting(false)}
          isSubmitting={submitting}
        />
      ) : (
        <AddButton
          label="Request a sign-off"
          onClick={() => setRequesting(true)}
          // Asking for a sign-off goes through `_require_writer`, so a
          // read-only holder would be offered a button that refuses.
          // Read off the detail this page already holds.
          disabled={passport?.entitlement?.can_write === false}
        />
      )}

      {competency ? (
        <StateMessage
          icon={<IconFileText />}
          title={competency.name}
          description={`${competency.logbook_entries} logbook ${
            competency.logbook_entries === 1 ? "entry" : "entries"
          }`}
        />
      ) : (
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="Nothing recorded yet"
          description="This competency has no sign-offs, logbook entries or certificates."
        />
      )}
    </Stack>
  );
}
