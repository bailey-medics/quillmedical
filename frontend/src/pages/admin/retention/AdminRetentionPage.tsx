/**
 * Admin Retention Page
 *
 * Closed accounts whose training records are past the period their
 * sponsor asked for them to be kept. The nightly run lists them here and
 * deletes none: somebody decides, for each, to delete, keep or leave for
 * later, and one button carries out whatever has been marked.
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
import StateMessage from "@/components/state-message";
import { BodyText } from "@/components/typography";
import {
  listRetentionReviews,
  sendRetentionDecisions,
  type RetentionDecision,
  type RetentionReview,
} from "@/lib/retention/retentionReviews";

function accounts(count: number): string {
  return `${count} ${count === 1 ? "account" : "accounts"}`;
}

export default function AdminRetentionPage() {
  const { showMessage } = usePageMessage();
  const [reviews, setReviews] = useState<RetentionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<Record<number, string>>({});

  const fetchReviews = useCallback(async () => {
    try {
      setReviews(await listRetentionReviews());
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
          description: `Deleted the records of ${accounts(outcome.deleted)} and kept ${accounts(outcome.kept)}. The reason is shown beside each one left.`,
        });
      } else {
        showMessage({
          variant: "success",
          title: "Decisions carried out",
          description: `Deleted the records of ${accounts(outcome.deleted)} and kept ${accounts(outcome.kept)}.`,
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
        period their sponsor asked for them to be kept. Nothing is deleted until
        you decide. Deleting cannot be undone.
      </BodyText>

      {reviews.length === 0 ? (
        <StateMessage
          icon={<IconCircleCheck />}
          title="Nothing is awaiting a decision"
          description="When a closed account's records pass their period, they are listed here."
          colour="success"
        />
      ) : (
        <RetentionDecisionList
          reviews={reviews}
          refusals={refusals}
          onCarryOut={carryOut}
          onClear={() => setRefusals({})}
        />
      )}
    </Stack>
  );
}
