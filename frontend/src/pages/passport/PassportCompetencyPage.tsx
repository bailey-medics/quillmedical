/**
 * Passport Competency Page
 *
 * One competency's history: its sign-offs in full, and the form for
 * requesting a new one.
 *
 * The assessor list comes from `/users`, as the admin pages fetch it.
 * There is no passport endpoint listing assessors, so the page does the
 * fetching and `SignOffRequestForm` stays presentational.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import SignOffRequestForm from "@/components/passport/SignOffRequestForm";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import AddButton from "@/components/button/AddButton";
import { api } from "@lib/api";
import { fetchMyPassport, requestSignOff } from "@lib/passport";
import type {
  CompetencyState,
  PassportDetail,
  SignOffRequestInput,
} from "@lib/passport";

interface ApiUser {
  id: number;
  username: string;
}

export function Component() {
  const { id: competencyId } = useParams<{ id: string }>();
  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [assessors, setAssessors] = useState<
    { value: string; label: string }[]
  >([]);
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
        // A missing assessor list is not fatal: the rest of the page
        // still reads, and the request form simply has nobody to offer.
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
          assessors={assessors}
          onSubmit={handleRequest}
          onCancel={() => setRequesting(false)}
          isSubmitting={submitting}
        />
      ) : (
        <AddButton
          label="Request a sign-off"
          onClick={() => setRequesting(true)}
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
          icon={<IconFileText />}
          title="Nothing recorded yet"
          description="This competency has no sign-offs, logbook entries or certificates."
        />
      )}
    </Stack>
  );
}
