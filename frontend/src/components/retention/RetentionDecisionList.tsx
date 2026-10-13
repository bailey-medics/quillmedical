/**
 * Retention Decision List
 *
 * Every closed account whose training records are awaiting a decision,
 * one card each, with the single button that carries out whatever has
 * been marked.
 *
 * It holds what has been marked and asks before anything is done. It
 * does not fetch or send: the page gives it the accounts and a function
 * to call, which is what lets a story show it with made-up people.
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import ButtonPairRed from "@/components/button/ButtonPairRed";
import { ConfirmModal } from "@/components/confirm-modal";
import { BodyText } from "@/components/typography";
import type {
  RetentionChoice,
  RetentionDecision,
  RetentionReview,
} from "@/lib/retention/retentionReviews";
import RetentionReviewCard from "./RetentionReviewCard";

/** What has been marked for one account, before anything is sent */
interface Marked {
  choice: RetentionChoice;
  note: string;
}

const UNMARKED: Marked = { choice: "undecided", note: "" };

function accounts(count: number): string {
  return `${count} ${count === 1 ? "account" : "accounts"}`;
}

interface RetentionDecisionListProps {
  /** The accounts awaiting a decision */
  reviews: RetentionReview[];
  /** Why the last attempt was refused, by review id */
  refusals?: Record<number, string>;
  /**
   * Carries out the decisions. Called only after the confirmation, and
   * only with the accounts that were marked delete or keep.
   */
  onCarryOut: (decisions: RetentionDecision[]) => Promise<void>;
  /** Called when every choice is cleared */
  onClear?: () => void;
}

export default function RetentionDecisionList({
  reviews,
  refusals = {},
  onCarryOut,
  onClear,
}: RetentionDecisionListProps) {
  const [marked, setMarked] = useState<Record<number, Marked>>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  function mark(id: number, change: Partial<Marked>) {
    setMarked((current) => ({
      ...current,
      [id]: { ...(current[id] ?? UNMARKED), ...change },
    }));
  }

  // An account that has left the list keeps no mark: only what is on
  // screen can be sent.
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
      await onCarryOut(decisions);
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  return (
    <Stack gap="lg">
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
          onClear?.();
        }}
        acceptDisabled={decided.length === 0 || reasonMissing || sending}
      />

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
