/**
 * Passport Logbook Confirmation Page
 *
 * Where a supervisor confirms one logbook entry they were asked about,
 * reached from the inbox. It shows that entry and nothing else of the
 * holder's passport: being asked about one procedure opens no other.
 *
 * Confirming says the procedure happened as recorded. It is not a
 * sign-off, which is a judgement about competence and has a page of its
 * own.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";
import ErrorState from "@/components/error-state/ErrorState";
import PageHeader from "@/components/page-header";
import LogbookConfirmationForm from "@/components/passport/LogbookConfirmationForm";
import { INBOX_PATH, inboxChanged } from "@/lib/inbox/inbox";
import {
  answerLogbookConfirmation,
  fetchLogbookConfirmation,
} from "@lib/passport";
import type { LogbookConfirmation } from "@lib/passport";

const NOTHING_TO_CONFIRM = "There is nothing here to confirm.";

export function Component() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState<LogbookConfirmation | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // An address that is not a number names no ask. Worked out here and
  // not in the effect, so nothing is fetched and no state is set for it.
  const id = Number(requestId);
  const isAnAsk = Number.isInteger(id);

  useEffect(() => {
    if (!isAnAsk) return;

    let cancelled = false;

    fetchLogbookConfirmation(id)
      .then((found) => {
        if (!cancelled) setConfirmation(found);
      })
      .catch(() => {
        // Answered already, withdrawn, or never asked of this person.
        // The server says the same for all three, and so does this.
        if (!cancelled) setError(NOTHING_TO_CONFIRM);
      });

    return () => {
      cancelled = true;
    };
  }, [id, isAnAsk]);

  const shownError = isAnAsk ? error : NOTHING_TO_CONFIRM;

  async function answer(confirmed: boolean) {
    if (!confirmation) return;

    setSubmitting(true);
    try {
      await answerLogbookConfirmation(confirmation.id, confirmed);
      // One fewer thing is waiting, so the envelope is told at once.
      inboxChanged();
      navigate(INBOX_PATH);
    } catch (caught) {
      const said = caught instanceof Error ? caught.message.trim() : "";
      setError(
        said !== ""
          ? said
          : "Your answer could not be saved. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Confirm a logbook entry" />

      {shownError && <ErrorState message={shownError} />}

      {confirmation && (
        <LogbookConfirmationForm
          confirmation={confirmation}
          onConfirm={() => void answer(true)}
          onDecline={() => void answer(false)}
          isSubmitting={submitting}
        />
      )}
    </Stack>
  );
}

export default Component;
