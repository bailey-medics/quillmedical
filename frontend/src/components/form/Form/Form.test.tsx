import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import { Stack } from "@mantine/core";
import { Form, FormStatus, SubmitButton, useFormContext } from "./index";
import type { FormSubmitResult } from "./Form";
import TextField from "../TextField";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TestFormValues {
  name: string;
}

function TestForm({
  onSubmit,
  timeoutMs,
}: {
  onSubmit: (data: TestFormValues) => Promise<FormSubmitResult>;
  timeoutMs?: number;
}) {
  return (
    <Form<TestFormValues>
      defaultValues={{ name: "" }}
      onSubmit={onSubmit}
      submitLabel="Save"
      submittingLabel="Saving…"
      timeoutMs={timeoutMs}
    >
      <Stack gap="md">
        <FormStatus />
        <TextField label="Name" />
        <SubmitButton />
      </Stack>
    </Form>
  );
}

describe("Form", () => {
  describe("Initial state", () => {
    it("renders submit button with label", () => {
      renderWithMantine(
        <TestForm
          onSubmit={async () => ({
            state: "success",
            message: { title: "OK" },
          })}
        />,
      );
      expect(screen.getByTestId("submit-button")).toHaveTextContent("Save");
    });

    it("does not render FormStatus in idle state", () => {
      renderWithMantine(
        <TestForm
          onSubmit={async () => ({
            state: "success",
            message: { title: "OK" },
          })}
        />,
      );
      expect(screen.queryByTestId("form-status")).not.toBeInTheDocument();
    });
  });

  describe("Submission", () => {
    it("shows submitting label during submission", async () => {
      const user = userEvent.setup();
      let resolveSubmit: (value: FormSubmitResult) => void;
      const submitPromise = new Promise<FormSubmitResult>((resolve) => {
        resolveSubmit = resolve;
      });

      renderWithMantine(<TestForm onSubmit={() => submitPromise} />);

      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        expect(screen.getByTestId("submit-button")).toHaveAttribute(
          "aria-disabled",
          "true",
        );
      });

      // Resolve the submission
      resolveSubmit!({ state: "success", message: { title: "Saved" } });

      await waitFor(() => {
        expect(screen.getByTestId("form-status")).toBeInTheDocument();
      });
    });

    it("shows success status after successful submission", async () => {
      const user = userEvent.setup();
      const handleSubmit = async (): Promise<FormSubmitResult> => ({
        state: "success",
        message: { title: "Settings saved", description: "Changes applied." },
      });

      renderWithMantine(<TestForm onSubmit={handleSubmit} />);

      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        const status = screen.getByTestId("form-status");
        expect(status).toBeInTheDocument();
        expect(status).toHaveAttribute("role", "status");
      });
      expect(screen.getByText("Settings saved")).toBeInTheDocument();
      expect(screen.getByText("Changes applied.")).toBeInTheDocument();
    });

    it("shows error status after failed submission", async () => {
      const user = userEvent.setup();
      const handleSubmit = async (): Promise<FormSubmitResult> => ({
        state: "error",
        message: { title: "Failed to save", description: "Server error." },
      });

      renderWithMantine(<TestForm onSubmit={handleSubmit} />);

      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        const status = screen.getByTestId("form-status");
        expect(status).toBeInTheDocument();
        expect(status).toHaveAttribute("role", "alert");
      });
      expect(screen.getByText("Failed to save")).toBeInTheDocument();
    });

    it("shows partial_success status", async () => {
      const user = userEvent.setup();
      const handleSubmit = async (): Promise<FormSubmitResult> => ({
        state: "partial_success",
        message: {
          title: "Partially saved",
          description: "GP delivery pending.",
        },
      });

      renderWithMantine(<TestForm onSubmit={handleSubmit} />);

      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        const status = screen.getByTestId("form-status");
        expect(status).toBeInTheDocument();
        expect(status).toHaveAttribute("role", "status");
      });
      expect(screen.getByText("Partially saved")).toBeInTheDocument();
    });

    it("handles thrown errors gracefully", async () => {
      const user = userEvent.setup();
      const handleSubmit = async (): Promise<FormSubmitResult> => {
        throw new Error("Network failure");
      };

      renderWithMantine(<TestForm onSubmit={handleSubmit} />);

      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        const status = screen.getByTestId("form-status");
        expect(status).toBeInTheDocument();
        expect(status).toHaveAttribute("role", "alert");
      });
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(
        screen.getByText("An unexpected error occurred. Please try again."),
      ).toBeInTheDocument();
    });
  });

  describe("Timeout", () => {
    it("shows timeout status when submission exceeds timeout", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });

      const handleSubmit = async (): Promise<FormSubmitResult> => {
        await delay(60_000);
        return { state: "success", message: { title: "OK" } };
      };

      renderWithMantine(<TestForm onSubmit={handleSubmit} timeoutMs={500} />);

      await user.click(screen.getByTestId("submit-button"));

      // Advance past timeout
      vi.advanceTimersByTime(600);

      await waitFor(() => {
        expect(screen.getByTestId("form-status")).toBeInTheDocument();
      });
      expect(screen.getByText("Request timed out")).toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  describe("Validation error", () => {
    function ValidatedField() {
      const { methods } = useFormContext();
      const {
        register,
        formState: { errors },
      } = methods;
      return (
        <TextField
          label="Name"
          {...register("name", { required: "Name is required" })}
          error={errors.name?.message as string | undefined}
        />
      );
    }

    function ValidatedTestForm() {
      return (
        <Form<TestFormValues>
          defaultValues={{ name: "" }}
          onSubmit={async () => ({
            state: "success",
            message: { title: "OK" },
          })}
          submitLabel="Save"
          submittingLabel="Saving…"
        >
          <Stack gap="md">
            <FormStatus />
            <ValidatedField />
            <SubmitButton />
          </Stack>
        </Form>
      );
    }

    it("shows validation_error with warning when fields fail validation", async () => {
      const user = userEvent.setup();

      renderWithMantine(<ValidatedTestForm />);

      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        const status = screen.getByTestId("form-status");
        expect(status).toBeInTheDocument();
        expect(status).toHaveAttribute("role", "alert");
      });
      expect(
        screen.getByText("Please check the highlighted fields"),
      ).toBeInTheDocument();
      expect(screen.getByText("1 field needs attention.")).toBeInTheDocument();
    });

    it("keeps submit button enabled after validation_error", async () => {
      const user = userEvent.setup();

      renderWithMantine(<ValidatedTestForm />);

      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        expect(screen.getByTestId("form-status")).toBeInTheDocument();
      });

      expect(screen.getByTestId("submit-button")).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
  });

  describe("Disable when clean", () => {
    function RegisteredField() {
      const { methods } = useFormContext();
      const { register } = methods;
      return <TextField label="Name" {...register("name")} />;
    }

    function DisableWhenCleanForm() {
      return (
        <Form<TestFormValues>
          defaultValues={{ name: "Dr Smith" }}
          onSubmit={async () => ({
            state: "success",
            message: { title: "OK" },
          })}
          submitLabel="Save"
          submittingLabel="Saving…"
          disableWhenClean
        >
          <Stack gap="md">
            <FormStatus />
            <RegisteredField />
            <SubmitButton />
          </Stack>
        </Form>
      );
    }

    it("disables submit button when form is clean", () => {
      renderWithMantine(<DisableWhenCleanForm />);

      expect(screen.getByTestId("submit-button")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("enables submit button when form is dirty", async () => {
      const user = userEvent.setup();

      renderWithMantine(<DisableWhenCleanForm />);

      expect(screen.getByTestId("submit-button")).toHaveAttribute(
        "aria-disabled",
        "true",
      );

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "New name");

      expect(screen.getByTestId("submit-button")).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
  });
});

describe("FormStatus (prop-driven)", () => {
  it("renders success variant with role=status", () => {
    renderWithMantine(
      <FormStatus variant="success" title="Saved" description="Done." />,
    );
    const status = screen.getByTestId("form-status");
    expect(status).toHaveAttribute("role", "status");
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Done.")).toBeInTheDocument();
  });

  it("renders error variant with role=alert", () => {
    renderWithMantine(<FormStatus variant="error" title="Error" />);
    expect(screen.getByTestId("form-status")).toHaveAttribute("role", "alert");
  });

  it("renders timeout variant with role=alert", () => {
    renderWithMantine(<FormStatus variant="timeout" title="Timed out" />);
    expect(screen.getByTestId("form-status")).toHaveAttribute("role", "alert");
  });

  it("renders partial_success variant with role=status", () => {
    renderWithMantine(<FormStatus variant="partial_success" title="Partial" />);
    expect(screen.getByTestId("form-status")).toHaveAttribute("role", "status");
  });

  it("renders validation_error variant with role=alert", () => {
    renderWithMantine(
      <FormStatus variant="validation_error" title="Check fields" />,
    );
    expect(screen.getByTestId("form-status")).toHaveAttribute("role", "alert");
  });

  it("calls onDismiss when close button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    renderWithMantine(
      <FormStatus variant="success" title="Saved" onDismiss={onDismiss} />,
    );

    await user.click(screen.getByLabelText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does not render dismiss button without onDismiss", () => {
    renderWithMantine(<FormStatus variant="success" title="Saved" />);
    expect(screen.queryByLabelText("Dismiss")).not.toBeInTheDocument();
  });

  it("renders without description", () => {
    renderWithMantine(<FormStatus variant="success" title="Saved" />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});

describe("SubmitButton", () => {
  it("renders cancel button when onCancel is provided", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    renderWithMantine(
      <TestForm
        onSubmit={async () => ({ state: "success", message: { title: "OK" } })}
      />,
    );

    // The TestForm doesn't have onCancel, so let's test directly
    // by rendering within a Form context with cancel
    const { unmount } = renderWithMantine(
      <Form
        defaultValues={{ name: "" }}
        onSubmit={async () => ({
          state: "success" as const,
          message: { title: "OK" },
        })}
      >
        <SubmitButton onCancel={onCancel} cancelLabel="Back" />
      </Form>,
    );

    const backButton = screen.getByText("Back");
    expect(backButton).toBeInTheDocument();

    await user.click(backButton);
    expect(onCancel).toHaveBeenCalledOnce();

    unmount();
  });
});
