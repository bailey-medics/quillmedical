/**
 * Retention Review Card
 *
 * One person's training records at one organisation, past the period
 * their sponsor asked for them to be kept, with the choice to make about
 * them: leave for later, delete, or keep.
 *
 * Every card starts on "Leave for later", so the accounts that are clear
 * can be dealt with while one that is not is left alone. Keeping needs a
 * reason, because it holds records past what the privacy policy says,
 * and a date to be asked again, so that "keep" cannot quietly come to
 * mean "keep for ever". Whoever is deciding picks the date.
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import FormattedDate from "@/components/data/Date";
import DateField from "@/components/form/DateField";
import RadioField from "@/components/form/RadioField";
import TextAreaField from "@/components/form/TextAreaField";
import {
  BodyText,
  BodyTextBold,
  BodyTextInline,
  Heading,
} from "@/components/typography";
import {
  MAX_RETENTION_NOTE,
  tomorrow,
  type RetentionChoice,
  type RetentionReview,
} from "@/lib/retention/retentionReviews";

const CHOICES: { value: RetentionChoice; label: string }[] = [
  { value: "undecided", label: "Leave for later" },
  { value: "delete", label: "Delete these records" },
  { value: "keep", label: "Keep these records" },
];

function isChoice(value: string): value is RetentionChoice {
  return CHOICES.some((choice) => choice.value === value);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

interface RetentionReviewCardProps {
  /** The records to decide about */
  review: RetentionReview;
  /** What has been chosen for them so far */
  choice: RetentionChoice;
  /** The note written so far */
  note: string;
  /** Called when a different choice is picked */
  onChoiceChange: (choice: RetentionChoice) => void;
  /** Called as the note is typed */
  onNoteChange: (note: string) => void;
  /** For a keep: when to ask again, as YYYY-MM-DD, or null if cleared */
  askAgainOn: string | null;
  /** Called when a different date is picked */
  onAskAgainOnChange: (date: string | null) => void;
  /** Why the last attempt to carry this out was refused, if it was */
  refusal?: string;
  /** True while the decisions are being sent */
  disabled?: boolean;
}

export default function RetentionReviewCard({
  review,
  choice,
  note,
  onChoiceChange,
  onNoteChange,
  askAgainOn,
  onAskAgainOnChange,
  refusal,
  disabled = false,
}: RetentionReviewCardProps) {
  const keeping = choice === "keep";
  const noteMissing = keeping && note.trim() === "";

  return (
    <BaseCard>
      <Stack gap="md">
        <Stack gap={4}>
          <Heading>{review.full_name || "No name recorded"}</Heading>
          <BodyText>{review.email}</BodyText>
        </Stack>

        <Stack gap={4}>
          <Group gap="xs">
            <BodyTextBold>Organisation:</BodyTextBold>
            <BodyTextInline>{review.organisation}</BodyTextInline>
          </Group>
          <Group gap="xs">
            <BodyTextBold>Account closed:</BodyTextBold>
            <FormattedDate date={review.closed_at} />
          </Group>
          <Group gap="xs">
            <BodyTextBold>Period ended:</BodyTextBold>
            <FormattedDate date={review.due_on} />
          </Group>
          <Group gap="xs">
            <BodyTextBold>Would be deleted:</BodyTextBold>
            <BodyTextInline>
              {plural(review.attempts, "attempt", "attempts")} and{" "}
              {plural(review.enrolments, "enrolment", "enrolments")}
            </BodyTextInline>
          </Group>
        </Stack>

        <RadioField
          label="Decision"
          options={CHOICES}
          value={choice}
          onChange={(value) => {
            if (isChoice(value)) onChoiceChange(value);
          }}
          disabled={disabled}
          error={refusal}
        />

        {choice !== "undecided" && (
          <TextAreaField
            label={keeping ? "Why they are being kept" : "Note (optional)"}
            description={
              keeping
                ? "Kept records are held past the period promised, so the reason is recorded."
                : "Recorded with the decision."
            }
            value={note}
            onChange={(event) => onNoteChange(event.currentTarget.value)}
            required={keeping}
            error={noteMissing ? "A reason is needed to keep" : undefined}
            maxLength={MAX_RETENTION_NOTE}
            autosize
            minRows={2}
            disabled={disabled}
          />
        )}

        {keeping && (
          <DateField
            label="Ask again on"
            description="These records come back for a decision on this date. A year from today unless you choose another."
            value={askAgainOn}
            onChange={onAskAgainOnChange}
            minDate={tomorrow()}
            required
            error={askAgainOn === null ? "A date is needed to keep" : undefined}
            disabled={disabled}
          />
        )}
      </Stack>
    </BaseCard>
  );
}
