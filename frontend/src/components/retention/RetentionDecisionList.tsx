/**
 * Retention Decision List
 *
 * Every closed account whose training records are awaiting a decision,
 * and every closed account that is itself, one card each, with the
 * single button that carries out whatever has been marked.
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
import {
  oneYearOn,
  type RetentionAccount,
  type RetentionChoice,
  type RetentionDecision,
  type RetentionReview,
} from "@/lib/retention/retentionReviews";
import RetentionReviewCard from "./RetentionReviewCard";

/** What has been marked for one account, before anything is sent */
interface Marked {
  choice: RetentionChoice;
  note: string;
  /** For a keep: when to ask again, as YYYY-MM-DD, or null if cleared */
  askAgainOn: string | null;
}

/** Where every account starts: nothing chosen, and a year to ask again. */
function unmarked(): Marked {
  return { choice: "undecided", note: "", askAgainOn: oneYearOn() };
}

function accounts(count: number): string {
  return `${count} ${count === 1 ? "account" : "accounts"}`;
}

interface RetentionDecisionListProps {
  /** The training records awaiting a decision */
  reviews: RetentionReview[];
  /** The closed accounts awaiting a decision to empty them */
  accounts?: RetentionAccount[];
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
  accounts: accountsWaiting = [],
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
      [id]: { ...(current[id] ?? unmarked()), ...change },
    }));
  }

  // Records first, then the accounts with none left. One table holds
  // both, so an id is never shared between the two.
  const cards = [...reviews, ...accountsWaiting];

  // An account that has left the list keeps no mark: only what is on
  // screen can be sent.
  const decided = cards.filter(
    (review) => (marked[review.id] ?? unmarked()).choice !== "undecided",
  );
  const toDelete = reviews.filter(
    (review) => marked[review.id]?.choice === "delete",
  ).length;
  const toEmpty = accountsWaiting.filter(
    (account) => marked[account.id]?.choice === "delete",
  ).length;
  const toKeep = decided.length - toDelete - toEmpty;
  const keepUnfinished = decided.some((review) => {
    const row = marked[review.id] ?? unmarked();

    return (
      row.choice === "keep" &&
      (row.note.trim() === "" || row.askAgainOn === null)
    );
  });

  async function carryOut() {
    const decisions: RetentionDecision[] = decided.map((review) => {
      const row = marked[review.id] ?? unmarked();
      const note = row.note.trim();

      if (row.choice === "delete") {
        return {
          review_id: review.id,
          decision: "delete",
          ...(note ? { note } : {}),
        };
      }

      return {
        review_id: review.id,
        decision: "keep",
        ...(note ? { note } : {}),
        // The start of that day, in UTC.
        ...(row.askAgainOn
          ? { ask_again_on: `${row.askAgainOn}T00:00:00Z` }
          : {}),
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
      {cards.map((review) => {
        const row = marked[review.id] ?? unmarked();

        return (
          <RetentionReviewCard
            key={review.id}
            review={review}
            choice={row.choice}
            note={row.note}
            askAgainOn={row.askAgainOn}
            onChoiceChange={(choice) => mark(review.id, { choice })}
            onNoteChange={(note) => mark(review.id, { note })}
            onAskAgainOnChange={(askAgainOn) => mark(review.id, { askAgainOn })}
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
        acceptDisabled={decided.length === 0 || keepUnfinished || sending}
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
          Delete the training records of {accounts(toDelete)}, mark{" "}
          {accounts(toEmpty)} to be emptied by the next nightly run, and keep{" "}
          {toKeep} as marked. This cannot be undone. Anything left on
          &quot;Leave for later&quot; is not touched.
        </BodyText>
      </ConfirmModal>
    </Stack>
  );
}
