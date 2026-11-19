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

import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useForm,
  FormProvider,
  useFormState,
  type DefaultValues,
  type FieldValues,
  type FieldErrors,
  type Control,
  type Path,
  type PathValue,
} from "react-hook-form";
import {
  useBlocker,
  useInRouterContext,
  UNSAFE_DataRouterContext,
} from "react-router-dom";
import FormContext, {
  type FormState,
  type FormStatusMessage,
  type FormContextValue,
} from "./FormContext";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal";
import DirtyFormNavigation from "@/components/warnings";

export interface FormSubmitResult {
  /** Resulting state after submission */
  state: "success" | "partial_success" | "error" | "validation_error";
  /** Status message to display */
  message: FormStatusMessage;
  /**
   * What to do once a successful save has landed, such as navigating to
   * the saved record. Runs after the form is marked clean, so the form's
   * own leave warning does not stop it. Never call `navigate` inside
   * `onSubmit` itself: the save is still running there, and the warning
   * holds while it runs.
   */
  afterSave?: () => void;
}

export interface FormConfirmConfig {
  /** Bold centred heading in the modal */
  title?: string;
  /** Message body */
  children: ReactNode;
  /** Red action button label (defaults to "Confirm") */
  acceptLabel?: string;
  /** Label shown during submission (defaults to "Confirming…") */
  submittingLabel?: string;
  /** Outline button label (defaults to "Cancel") */
  cancelLabel?: string;
  /** Centred icon above title/message */
  icon?: ReactElement;
}

export interface FormProps<T extends FieldValues> {
  /** Default form values */
  defaultValues?: DefaultValues<T>;
  /**
   * Submit handler, sync or async: receives validated data, returns result.
   * Pass `signal` on to `api.ts`, so a save that times out is stopped
   * rather than left to land later.
   */
  onSubmit: (
    data: T,
    context: { signal: AbortSignal },
  ) => FormSubmitResult | Promise<FormSubmitResult>;
  /** Label for the submit button (defaults to "Save") */
  submitLabel?: string;
  /** Label shown during submission (defaults to "Saving…") */
  submittingLabel?: string;
  /** Timeout in milliseconds - triggers timeout state (defaults to 30000) */
  timeoutMs?: number;
  /** When true, submit button is disabled until the form is dirty (defaults to false) */
  disableWhenClean?: boolean;
  /** When provided, a confirmation modal gates submission after validation passes */
  confirm?: FormConfirmConfig;
  /** Block navigation when form is dirty (defaults to true) */
  blockNavigation?: boolean;
  /** Form content (FormStatus, fields, SubmitButton) */
  children: ReactNode;
}

interface NavigationGuardProps<T extends FieldValues> {
  control: Control<T>;
  onProceed: () => void;
  formState: FormState;
  /** True while a saved form's `afterSave` runs, so it may leave. */
  allowLeavingRef: RefObject<boolean>;
}

/**
 * Internal component that blocks navigation while the form has unsaved
 * edits or a save is still running. Must be rendered inside FormProvider
 * to access form state. Only activates inside a data router.
 *
 * Edits typed after a save are unsaved too, so the warning comes back
 * with them. A change of path or of query string counts as leaving; a
 * change of `#hash` alone does not.
 */
function FormNavigationBlocker<T extends FieldValues>({
  control,
  onProceed,
  formState,
  allowLeavingRef,
}: NavigationGuardProps<T>) {
  const { isDirty } = useFormState({ control });
  const shouldBlock = isDirty || formState === "submitting";

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowLeavingRef.current &&
      shouldBlock &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );

  return <DirtyFormNavigation blocker={blocker} onProceed={onProceed} />;
}

/**
 * Asks the browser to warn before a refresh or a closed tab drops
 * unsaved edits or a save still running. The browser shows its own
 * wording; no page can change it.
 */
function UnloadGuard<T extends FieldValues>({
  control,
  formState,
}: {
  control: Control<T>;
  formState: FormState;
}) {
  const { isDirty } = useFormState({ control });
  const shouldWarn = isDirty || formState === "submitting";

  useEffect(() => {
    if (!shouldWarn) return undefined;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [shouldWarn]);

  return null;
}

/**
 * Conditionally renders FormNavigationBlocker only when inside a data router.
 * useBlocker requires a data router (createBrowserRouter/createMemoryRouter),
 * not just any router context (e.g. MemoryRouter).
 */
function MaybeFormNavigationBlocker<T extends FieldValues>(
  props: NavigationGuardProps<T>,
) {
  const hasRouter = useInRouterContext();
  const dataRouterContext = useContext(UNSAFE_DataRouterContext);
  if (!hasRouter || !dataRouterContext) return null;
  return <FormNavigationBlocker {...props} />;
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
  confirm,
  blockNavigation = true,
  children,
}: FormProps<T>) {
  const methods = useForm<T>({ defaultValues, mode: "onChange" });
  const [formState, setFormState] = useState<FormState>("idle");
  const [statusMessage, setStatusMessage] = useState<FormStatusMessage | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingDataRef = useRef<T | null>(null);

  // Held from a submit until it is refused, cancelled or settles. The
  // button's own disabled state only takes effect on the next render, so
  // two submits in one tick would otherwise both get through.
  const busyRef = useRef(false);
  const allowLeavingRef = useRef(false);
  const [requestPending, setRequestPending] = useState(false);

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

  /**
   * Make what was saved the form's new starting point, keeping anything
   * typed while the save ran. Returns whether such edits exist; they stay
   * dirty, so the leave warning still covers them.
   */
  const markSaved = useCallback(
    (saved: T): boolean => {
      const current = methods.getValues();
      const newer = Object.keys(current).filter(
        (key) => JSON.stringify(current[key]) !== JSON.stringify(saved[key]),
      );

      methods.reset(saved, { keepValues: true });
      for (const key of newer) {
        methods.setValue(
          key as Path<T>,
          current[key] as PathValue<T, Path<T>>,
          { shouldDirty: true },
        );
      }

      return newer.length > 0;
    },
    [methods],
  );

  /**
   * Run a saved form's next step with its own leave warning stood down.
   * A router checks the warning as the navigation starts, so standing it
   * down for the synchronous part is enough.
   */
  const runAfterSave = useCallback((afterSave: () => void) => {
    allowLeavingRef.current = true;

    try {
      afterSave();
    } catch {
      // The save itself succeeded and is reported as such. A failed next
      // step must not read as a failed save, or the person saves again
      // and writes twice.
    } finally {
      allowLeavingRef.current = false;
    }
  }, []);

  const handleSubmit = useCallback(
    async (data: T) => {
      setFormState("submitting");
      setStatusMessage(null);

      const controller = new AbortController();
      abortRef.current = controller;

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      // The form stays held until the request itself settles, not just
      // until the timeout shows: a save that has timed out may still
      // land, and a second press would then write twice.
      setRequestPending(true);
      const request = Promise.resolve().then(() =>
        onSubmit(data, { signal: controller.signal }),
      );
      void request
        .catch(() => undefined)
        .finally(() => {
          busyRef.current = false;
          setRequestPending(false);
        });

      try {
        const result = await Promise.race([
          request,
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
          const hasNewerEdits = markSaved(data);

          // Edits typed during the save keep their warning: the form
          // does not leave over them.
          if (result.afterSave && !hasNewerEdits) {
            runAfterSave(result.afterSave);
          }
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
    [onSubmit, timeoutMs, markSaved, runAfterSave],
  );

  const handleInvalid = useCallback((errors: FieldErrors<T>) => {
    busyRef.current = false;
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

  const handleValidated = useCallback(
    (data: T) => {
      if (confirm) {
        pendingDataRef.current = data;
        setConfirmOpen(true);
      } else {
        void handleSubmit(data);
      }
    },
    [confirm, handleSubmit],
  );

  const handleConfirmAccept = useCallback(async () => {
    setConfirmOpen(false);
    if (pendingDataRef.current) {
      await handleSubmit(pendingDataRef.current);
      pendingDataRef.current = null;
    }
  }, [handleSubmit]);

  const handleConfirmClose = useCallback(() => {
    setConfirmOpen(false);
    pendingDataRef.current = null;
    busyRef.current = false;
  }, []);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (busyRef.current) {
      event.preventDefault();
      return;
    }

    busyRef.current = true;
    void methods.handleSubmit(handleValidated, handleInvalid)(event);
  }

  const contextValue: FormContextValue = {
    formState,
    statusMessage,
    dismissStatus,
    methods: methods as unknown as FormContextValue["methods"],
    submitLabel,
    submittingLabel,
    disableWhenClean,
    requestPending,
  };

  return (
    <FormContext.Provider value={contextValue}>
      <FormProvider {...methods}>
        <form onSubmit={handleFormSubmit} noValidate>
          {children}
        </form>
        {blockNavigation && (
          <>
            <MaybeFormNavigationBlocker
              control={methods.control}
              onProceed={() => methods.reset()}
              formState={formState}
              allowLeavingRef={allowLeavingRef}
            />
            <UnloadGuard control={methods.control} formState={formState} />
          </>
        )}
        {confirm && (
          <ConfirmModal
            opened={confirmOpen}
            onClose={handleConfirmClose}
            onAccept={handleConfirmAccept}
            title={confirm.title}
            acceptLabel={confirm.acceptLabel}
            submittingLabel={confirm.submittingLabel}
            cancelLabel={confirm.cancelLabel}
            icon={confirm.icon}
          >
            {confirm.children}
          </ConfirmModal>
        )}
      </FormProvider>
    </FormContext.Provider>
  );
}
