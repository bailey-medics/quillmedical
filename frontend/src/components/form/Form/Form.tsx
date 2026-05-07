/**
 * Form Component
 *
 * Wrapper that owns form submission state and exposes it via context.
 * Builds on React Hook Form and extends it with Quill-specific states
 * (partial_success, timeout) and composite outcome modelling.
 *
 * @example
 * ```tsx
 * <Form
 *   onSubmit={async (data) => {
 *     await api.put("/settings", data);
 *     return { state: "success", message: { title: "Saved" } };
 *   }}
 *   submitLabel="Save"
 *   submittingLabel="Saving…"
 * >
 *   <FormStatus />
 *   <TextField {...} />
 *   <SubmitButton />
 * </Form>
 * ```
 */

import { type ReactNode, useCallback, useRef, useState } from "react";
import {
  useForm,
  FormProvider,
  type DefaultValues,
  type FieldValues,
  type FieldErrors,
} from "react-hook-form";
import FormContext, {
  type FormState,
  type FormStatusMessage,
  type FormContextValue,
} from "./FormContext";

export interface FormSubmitResult {
  /** Resulting state after submission */
  state: "success" | "partial_success" | "error";
  /** Status message to display */
  message: FormStatusMessage;
}

export interface FormProps<T extends FieldValues> {
  /** Default form values */
  defaultValues?: DefaultValues<T>;
  /** Async submit handler — receives validated data, returns result */
  onSubmit: (data: T) => Promise<FormSubmitResult>;
  /** Label for the submit button (defaults to "Save") */
  submitLabel?: string;
  /** Label shown during submission (defaults to "Saving…") */
  submittingLabel?: string;
  /** Timeout in milliseconds — triggers timeout state (defaults to 30000) */
  timeoutMs?: number;
  /** When true, submit button is disabled until the form is dirty (defaults to false) */
  disableWhenClean?: boolean;
  /** Form content (FormStatus, fields, SubmitButton) */
  children: ReactNode;
}

/**
 * Form wrapper that owns submission state and provides it via context.
 */
export default function Form<T extends FieldValues>({
  defaultValues,
  onSubmit,
  submitLabel = "Save",
  submittingLabel = "Saving\u2026",
  timeoutMs = 30_000,
  disableWhenClean = false,
  children,
}: FormProps<T>) {
  const methods = useForm<T>({ defaultValues });
  const [formState, setFormState] = useState<FormState>("idle");
  const [statusMessage, setStatusMessage] = useState<FormStatusMessage | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  const dismissStatus = useCallback(() => {
    setStatusMessage(null);
    if (
      formState === "success" ||
      formState === "error" ||
      formState === "partial_success" ||
      formState === "validation_error" ||
      formState === "timeout"
    ) {
      setFormState("idle");
    }
  }, [formState]);

  const handleSubmit = useCallback(
    async (data: T) => {
      setFormState("submitting");
      setStatusMessage(null);

      const controller = new AbortController();
      abortRef.current = controller;

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const result = await Promise.race([
          onSubmit(data),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
        ]);

        clearTimeout(timeoutId);
        setFormState(result.state);
        setStatusMessage(result.message);
        if (result.state === "success" || result.state === "partial_success") {
          methods.reset(data);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === "AbortError") {
          setFormState("timeout");
          setStatusMessage({
            title: "Request timed out",
            description:
              "The server did not respond in time. Your changes may not have been saved.",
          });
        } else {
          setFormState("error");
          setStatusMessage({
            title: "Something went wrong",
            description: "An unexpected error occurred. Please try again.",
          });
        }
      } finally {
        abortRef.current = null;
      }
    },
    [onSubmit, timeoutMs, methods],
  );

  const handleInvalid = useCallback((errors: FieldErrors<T>) => {
    const count = Object.keys(errors).length;
    setFormState("validation_error");
    setStatusMessage({
      title: "Please check the highlighted fields",
      description:
        count === 1
          ? "1 field needs attention."
          : `${count} fields need attention.`,
    });
  }, []);

  const contextValue: FormContextValue = {
    formState,
    statusMessage,
    dismissStatus,
    methods: methods as unknown as FormContextValue["methods"],
    submitLabel,
    submittingLabel,
    disableWhenClean,
  };

  return (
    <FormContext.Provider value={contextValue}>
      <FormProvider {...methods}>
        <form
          onSubmit={methods.handleSubmit(handleSubmit, handleInvalid)}
          noValidate
        >
          {children}
        </form>
      </FormProvider>
    </FormContext.Provider>
  );
}
