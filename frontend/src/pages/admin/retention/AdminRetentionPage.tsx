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
import ButtonPairRed from "@/components/button/ButtonPairRed";
import { ConfirmModal } from "@/components/confirm-modal";
import ErrorState from "@/components/error-state/ErrorState";
import PageHeader from "@/components/page-header";
import { usePageMessage } from "@/components/page-message";
import RetentionReviewCard from "@/components/retention/RetentionReviewCard";
import StateMessage from "@/components/state-message";
import { BodyText } from "@/components/typography";
import {
  listRetentionReviews,
  sendRetentionDecisions,
  type RetentionChoice,
  type RetentionDecision,
  type RetentionReview,
} from "@/lib/retention/retentionReviews";

/** What has been marked for one row, before anything is sent */
interface Marked {
  choice: RetentionChoice;
  note: string;
}

const UNMARKED: Marked = { choice: "undecided", note: "" };

function accounts(count: number): string {
  return `${count} ${count === 1 ? "account" : "accounts"}`;
}

export default function AdminRetentionPage() {
  const { showMessage } = usePageMessage();
  const [reviews, setReviews] = useState<RetentionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marked, setMarked] = useState<Record<number, Marked>>({});
  const [refusals, setRefusals] = useState<Record<number, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

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

  function mark(id: number, change: Partial<Marked>) {
    setMarked((current) => ({
      ...current,
      [id]: { ...(current[id] ?? UNMARKED), ...change },
    }));
  }

  const decided = reviews.filter(
    (review) => (marked[review.id] ?? UNMARKED).choice !== "undecided",
  );
  const toDelete = decided.filter(
    (review) => marked[review.id]?.choice === "delete",
  ).length;
  const toKeep = decided.length - toDelete;
  const reasonMissing = decided.some((review) => {
    const row = marked[review.id] ?? UNMARKED;

    return row.choice === "keep" && row.note.trim() === "";
  });

  async function carryOut() {
    const decisions: RetentionDecision[] = decided.map((review) => {
      const row = marked[review.id] ?? UNMARKED;
      const note = row.note.trim();

      return {
        review_id: review.id,
        decision: row.choice === "delete" ? "delete" : "keep",
        ...(note ? { note } : {}),
      };
    });

    setSending(true);
    try {
      const outcome = await sendRetentionDecisions(decisions);
      const refused: Record<number, string> = {};

      for (const refusal of outcome.refused) {
        refused[refusal.review_id] = refusal.reason;
      }

      // What was refused keeps its mark, so the reason shows beside the
      // choice that caused it. Everything carried out leaves the list.
      setRefusals(refused);
      setMarked((current) => {
        const kept: Record<number, Marked> = {};

        for (const id of Object.keys(refused)) {
          const row = current[Number(id)];
          if (row) kept[Number(id)] = row;
        }

        return kept;
      });
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
    } finally {
      setSending(false);
      setConfirming(false);
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
        <>
          {reviews.map((review) => {
            const row = marked[review.id] ?? UNMARKED;

            return (
              <RetentionReviewCard
                key={review.id}
                review={review}
                choice={row.choice}
                note={row.note}
                onChoiceChange={(choice) => mark(review.id, { choice })}
                onNoteChange={(note) => mark(review.id, { note })}
                refusal={refusals[review.id]}
                disabled={sending}
              />
            );
          })}

          <ButtonPairRed
            acceptLabel="Carry out decisions"
            cancelLabel="Clear choices"
            onAccept={() => setConfirming(true)}
            onCancel={() => {
              setMarked({});
              setRefusals({});
            }}
            acceptDisabled={decided.length === 0 || reasonMissing || sending}
          />
        </>
      )}

      <ConfirmModal
        opened={confirming}
        onClose={() => setConfirming(false)}
        onAccept={carryOut}
        title="Carry out these decisions?"
        acceptLabel="Carry out decisions"
        submittingLabel="Carrying out"
        destructive
      >
        <BodyText>
          Delete the training records of {accounts(toDelete)}, and keep those of{" "}
          {accounts(toKeep)}. Deleting cannot be undone. Anything left on
          &quot;Leave for later&quot; is not touched.
        </BodyText>
      </ConfirmModal>
    </Stack>
  );
}
