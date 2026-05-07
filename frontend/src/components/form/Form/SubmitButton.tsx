/**
 * SubmitButton Component
 *
 * Subscribes to Form context to reflect submission state.
 * Disabled during validating/submitting to prevent double-submit.
 * Composes ButtonPair for consistent sizing, layout, and cancel-button styling.
 *
 * @example
 * ```tsx
 * // Inside a <Form> wrapper — no props needed
 * <SubmitButton />
 *
 * // With cancel button
 * <SubmitButton onCancel={() => navigate(-1)} cancelLabel="Back" />
 * ```
 */

import { Loader } from "@mantine/core";
import { useFormState } from "react-hook-form";
import ButtonPair from "@/components/button/ButtonPair";
import { useFormContext } from "./FormContext";

interface SubmitButtonProps {
  /** Cancel button handler — if provided, renders a cancel button */
  onCancel?: () => void;
  /** Cancel button label (defaults to "Cancel") */
  cancelLabel?: string;
}

export default function SubmitButton({
  onCancel,
  cancelLabel = "Cancel",
}: SubmitButtonProps) {
  const { formState, submitLabel, submittingLabel, disableWhenClean, methods } =
    useFormContext();

  const { isDirty } = useFormState({ control: methods.control });
  const isDisabled =
    formState === "validating" ||
    formState === "submitting" ||
    (disableWhenClean && !isDirty);
  const isLoading = formState === "submitting";

  return (
    <ButtonPair
      acceptType="submit"
      acceptDisabled={isDisabled}
      acceptTestId="submit-button"
      onCancel={onCancel}
      cancelLabel={cancelLabel}
      acceptChildren={
        <span style={{ display: "grid" }}>
          <span
            style={{
              gridArea: "1/1",
              visibility: isLoading ? "hidden" : "visible",
            }}
          >
            {submitLabel}
          </span>
          <span
            style={{
              gridArea: "1/1",
              visibility: isLoading ? "visible" : "hidden",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Loader size="xs" color="white" aria-hidden="true" />
            {submittingLabel}
          </span>
        </span>
      }
    />
  );
}
