/**
 * AppraisalPeriodForm Component
 *
 * One of the holder's CPD date ranges: the first and last day of an
 * appraisal year, over which their CPD is totalled. The record calls it
 * an appraisal period; the screen calls it a date range, because that is
 * what the holder is setting.
 *
 * **An end before the start is refused here**, before anything is sent,
 * because the holder can see the mistake the moment both dates are in.
 * **An overlap is refused by the server**, which alone sees every other
 * range, so the form shows whatever it said through `error`.
 *
 * Any length is allowed. A short range after moving post is the case the
 * list exists for.
 *
 * @example
 * ```tsx
 * <AppraisalPeriodForm onSubmit={save} onCancel={close} error={message} />
 * ```
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { DateField } from "@components/form";
import { ErrorMessage, Heading } from "@/components/typography";
import ButtonPair from "@/components/button/ButtonPair";
import type { AppraisalPeriod } from "@lib/passport";

export interface AppraisalPeriodFormProps {
  /** Called with the completed range */
  onSubmit: (period: AppraisalPeriod) => void;
  /** Called when the holder backs out */
  onCancel?: () => void;
  /** Disables submission while a request is in flight */
  isSubmitting?: boolean;
  /**
   * A range to correct. The form starts filled in from it, and says so
   * in its heading and button; without it the form adds a new one.
   */
  initial?: AppraisalPeriod;
  /** Why the server refused the last attempt, such as an overlap */
  error?: string | null;
}

export default function AppraisalPeriodForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
  initial,
  error,
}: AppraisalPeriodFormProps) {
  const [startsOn, setStartsOn] = useState<string | null>(
    initial?.starts_on ?? null,
  );
  const [endsOn, setEndsOn] = useState<string | null>(initial?.ends_on ?? null);

  // ISO dates compare correctly as strings.
  const endsTooSoon = startsOn !== null && endsOn !== null && endsOn < startsOn;

  const canSubmit =
    startsOn !== null && endsOn !== null && !endsTooSoon && !isSubmitting;

  function handleSubmit() {
    if (!canSubmit || startsOn === null || endsOn === null) return;
    onSubmit({ starts_on: startsOn, ends_on: endsOn });
  }

  return (
    <BaseCard data-testid="appraisal-period-form">
      <Stack gap="md">
        <Heading>
          {initial ? "Edit this date range" : "Add a date range"}
        </Heading>

        <DateField
          label="From"
          description="The first day of your appraisal year."
          value={startsOn}
          onChange={setStartsOn}
          maxLevel="year"
          required
        />

        <DateField
          label="To"
          description="The last day it covers."
          value={endsOn}
          onChange={setEndsOn}
          minDate={startsOn ?? undefined}
          maxLevel="year"
          error={
            endsTooSoon
              ? "A date range cannot end before it starts."
              : undefined
          }
          required
        />

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <ButtonPair
          acceptLabel={initial ? "Save changes" : "Add date range"}
          acceptDisabled={!canSubmit}
          acceptLoading={isSubmitting}
          onAccept={handleSubmit}
          onCancel={onCancel}
        />
      </Stack>
    </BaseCard>
  );
}
