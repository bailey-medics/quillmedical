/**
 * Admin Retention Page
 *
 * Closed accounts whose training records are past the period their
 * sponsor asked for them to be kept, and closed accounts with no
 * records left that are due to be emptied. The nightly run lists them
 * here and deletes none: somebody decides, for each, to delete, keep or
 * leave for later, and one button carries out whatever has been marked.
 *
 * Operator-only: the records belong to every sponsor, not to one place.
 * The route guard hides the page; the API refuses the data.
 */

import { useCallback, useEffect, useState } from "react";
import { Skeleton, Stack } from "@mantine/core";
import { IconCircleCheck } from "@tabler/icons-react";
import ErrorState from "@/components/error-state/ErrorState";
import PageHeader from "@/components/page-header";
import { usePageMessage } from "@/components/page-message";
import RetentionDecisionList from "@/components/retention/RetentionDecisionList";
import RetentionExceptionCard from "@/components/retention/RetentionExceptionCard";
import StateMessage from "@/components/state-message";
import { BodyText, Heading } from "@/components/typography";
import {
  listRetentionReviews,
  sendRetentionDecisions,
  type RetentionAccount,
  type RetentionException,
  type RetentionDecision,
  type RetentionOutcome,
  type RetentionReview,
} from "@/lib/retention/retentionReviews";

function accounts(count: number): string {
  return `${count} ${count === 1 ? "account" : "accounts"}`;
}

/** What was done, in a sentence. */
function done(outcome: RetentionOutcome): string {
  return `Deleted the records of ${accounts(outcome.deleted)}, marked ${accounts(outcome.to_empty)} to be emptied and kept ${outcome.kept}.`;
}

export default function AdminRetentionPage() {
  const { showMessage } = usePageMessage();
  const [reviews, setReviews] = useState<RetentionReview[]>([]);
  const [waiting, setWaiting] = useState<RetentionAccount[]>([]);
  const [exceptions, setExceptions] = useState<RetentionException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<Record<number, string>>({});

  const fetchReviews = useCallback(async () => {
    try {
      const listed = await listRetentionReviews();

      setReviews(listed.reviews);
      setWaiting(listed.accounts);
      setExceptions(listed.exceptions);
      setError(null);
    } catch {
      setError("The records awaiting a decision could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await fetchReviews();
    })();
  }, [fetchReviews]);

  // Never throws: a failure is said on the page, and the list closes its
  // confirmation either way.
  async function carryOut(decisions: RetentionDecision[]) {
    try {
      const outcome = await sendRetentionDecisions(decisions);
      const refused: Record<number, string> = {};

      for (const refusal of outcome.refused) {
        refused[refusal.review_id] = refusal.reason;
      }

      // What was refused stays on the list, marked as it was, with the
      // reason beside it. Everything carried out leaves the list.
      setRefusals(refused);
      await fetchReviews();

      if (outcome.refused.length > 0) {
        showMessage({
          variant: "error",
          title: `${accounts(outcome.refused.length)} could not be dealt with`,
          description: `${done(outcome)} The reason is shown beside each one left.`,
        });
      } else {
        showMessage({
          variant: "success",
          title: "Decisions carried out",
          description: done(outcome),
        });
      }
    } catch {
      showMessage({
        variant: "error",
        title: "The decisions were not carried out",
        description: "Nothing was deleted. Try again.",
      });
    }
  }

  if (loading) {
    return (
      <Stack gap="lg">
        <Skeleton height={60} />
        <Skeleton height={220} />
        <Skeleton height={220} />
      </Stack>
    );
  }

  if (error) {
    return <ErrorState title="Error loading records" message={error} />;
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Record retention" />

      <BodyText>
        These accounts are closed, and their training records are past the
        period their sponsor asked for them to be kept. Once an account has no
        records left, and has been closed for two years, the account itself is
        listed to be emptied. Nothing is deleted until you decide, and neither
        can be undone.
      </BodyText>

      {reviews.length === 0 && waiting.length === 0 ? (
        <StateMessage
          icon={<IconCircleCheck />}
          title="Nothing is awaiting a decision"
          description="When a closed account's records pass their period, they are listed here."
          colour="success"
        />
      ) : (
        <RetentionDecisionList
          reviews={reviews}
          accounts={waiting}
          refusals={refusals}
          onCarryOut={carryOut}
          onClear={() => setRefusals({})}
        />
      )}

      {exceptions.length > 0 && (
        <Stack gap="lg">
          <Heading>Exceptions</Heading>
          <BodyText>
            Accounts marked to be emptied that were not. Each says why. Nothing
            here needs doing: failures are tried again each night.
          </BodyText>
          {exceptions.map((exception) => (
            <RetentionExceptionCard key={exception.id} exception={exception} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
