/**
 * DateField Component
 *
 * Standardised date input wrapping Mantine's DateInput, matching
 * `TextField`'s label styling, description and error treatment so a date
 * sits in a form beside the other fields without looking borrowed.
 *
 * **Values are `YYYY-MM-DD` strings, never `Date` objects.** Mantine 9's
 * DateInput works in strings natively, and so does every date the backend
 * sends or accepts - `observed_on`, `performed_on`, `awarded_on`. Passing
 * `Date` through would mean parsing and re-serialising at both ends,
 * which is where a timezone silently shifts a clinical date by a day.
 *
 * **Typed dates are read day, month, year.** `parseDateInput` takes
 * 27/03/2026 or 27 March 2026, and refuses a two-digit year or a day that
 * does not exist, with a message, rather than guessing.
 *
 * A date here carries no time of day, deliberately. Nobody recalls
 * whether a procedure was at 09:30 or 11:00 when logging five of them on
 * a Friday evening.
 *
 * @example
 * ```tsx
 * <DateField
 *   label="Observed on"
 *   value={observedOn}
 *   onChange={setObservedOn}
 *   maxDate={today}
 *   required
 * />
 * ```
 */

import { DateInput, type DateInputProps } from "@mantine/dates";
import { useState, type FocusEvent } from "react";
import { dateInputMessage, parseDateInput } from "./parseDateInput";
import { ErrorMessage } from "@components/typography";
import FieldDescription from "@components/typography/FieldDescription";
import classes from "./DateField.module.css";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-md)",
    color: "var(--mantine-color-text)",
    marginBottom: "0.25rem",
  },
  input: {
    fontSize: "var(--mantine-font-size-md)",
    fontWeight: 500,
    "&::placeholder": { color: "var(--mantine-color-placeholder)" },
  },
  required: { color: "var(--mantine-color-secondary-5)" },
};

// The calendar's arrows otherwise have generic names, so a screen reader
// cannot tell a month from a year. The button between them is left alone:
// its visible text, such as "March 2026", is already its name, and a label
// in place of that text fails WCAG's "label in name" rule.
const CALENDAR_LABELS = {
  nextMonth: "Next month",
  previousMonth: "Previous month",
  nextYear: "Next year",
  previousYear: "Previous year",
  nextDecade: "Next decade",
  previousDecade: "Previous decade",
};

/** Mantine calls this on every keystroke; null leaves the value alone. */
function parseTyped(text: string): string | null {
  const parsed = parseDateInput(text);

  return parsed.kind === "date" ? parsed.value : null;
}

export default function DateField({
  description,
  error,
  valueFormat = "D MMMM YYYY",
  placeholder = "DD/MM/YYYY",
  clearButtonProps,
  onBlur,
  ...props
}: DateInputProps) {
  // Text that was typed and refused. Mantine puts the last good date
  // back on blur, so without a message the typing just vanishes.
  const [typedError, setTypedError] = useState<string | null>(null);

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setTypedError(dateInputMessage(parseDateInput(event.currentTarget.value)));
    onBlur?.(event);
  }

  const shownError = error ?? typedError;

  return (
    <DateInput
      {...props}
      // British reading order, matching the rest of the interface.
      valueFormat={valueFormat}
      dateParser={parseTyped}
      onBlur={handleBlur}
      ariaLabels={CALENDAR_LABELS}
      placeholder={placeholder}
      // Mantine's clear button is an icon with no name, so a screen
      // reader announces only "button".
      clearButtonProps={{ "aria-label": "Clear date", ...clearButtonProps }}
      description={
        description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : undefined
      }
      error={shownError ? <ErrorMessage>{shownError}</ErrorMessage> : undefined}
      size="md"
      styles={fieldStyles}
      classNames={{
        root: classes.root,
        day: classes.day,
      }}
      popoverProps={{
        ...props.popoverProps,
        classNames: { dropdown: classes.dropdown },
      }}
    />
  );
}
