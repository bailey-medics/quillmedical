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
 * **Typed dates are read day, month, year**, or month first where the
 * jurisdiction or `dateOrder` says so. `parseDateInput` takes 27/03/2026
 * or 27 March 2026, and refuses a two-digit year or a day that does not
 * exist, with a message, rather than guessing.
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
import { DEFAULT_DATE_ORDER, type DateOrder } from "@lib/dateOrder";
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

// What each order shows when the caller gives nothing else. A value is
// written with the month as a word, so it cannot be misread either way.
const ORDER_DEFAULTS: Record<
  DateOrder,
  { valueFormat: string; placeholder: string }
> = {
  dmy: { valueFormat: "D MMMM YYYY", placeholder: "DD/MM/YYYY" },
  mdy: { valueFormat: "MMMM D, YYYY", placeholder: "MM/DD/YYYY" },
};

export interface DateFieldProps extends DateInputProps {
  /**
   * The order a typed date is read in. Defaults to the deployment's
   * jurisdiction, from `shared/jurisdiction-config.yaml`.
   */
  dateOrder?: DateOrder;
}

export default function DateField({
  dateOrder = DEFAULT_DATE_ORDER,
  description,
  error,
  valueFormat = ORDER_DEFAULTS[dateOrder].valueFormat,
  placeholder = ORDER_DEFAULTS[dateOrder].placeholder,
  clearButtonProps,
  onBlur,
  ...props
}: DateFieldProps) {
  // Text that was typed and refused. Mantine puts the last good date
  // back on blur, so without a message the typing just vanishes.
  const [typedError, setTypedError] = useState<string | null>(null);

  // Mantine calls this on every keystroke; null leaves the value alone.
  function parseTyped(text: string): string | null {
    const parsed = parseDateInput(text, dateOrder);

    return parsed.kind === "date" ? parsed.value : null;
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    const parsed = parseDateInput(event.currentTarget.value, dateOrder);

    setTypedError(dateInputMessage(parsed, dateOrder));
    onBlur?.(event);
  }

  const shownError = error ?? typedError;

  return (
    <DateInput
      {...props}
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
