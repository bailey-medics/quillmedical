/**
 * LogbookConfirmationForm Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import LogbookConfirmationForm from "./LogbookConfirmationForm";
import { logbookConfirmation } from "./fixtures";

function renderForm(
  props: Partial<React.ComponentProps<typeof LogbookConfirmationForm>> = {},
) {
  return renderWithMantine(
    <LogbookConfirmationForm
      confirmation={logbookConfirmation}
      onConfirm={vi.fn()}
      onDecline={vi.fn()}
      {...props}
    />,
  );
}

describe("LogbookConfirmationForm", () => {
  it("says who is asking and about which competency", () => {
    renderForm();
    expect(
      screen.getByText("Review and prescribe systemic anti-cancer therapy"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Dr Priya Shah has asked you/)).toBeInTheDocument();
  });

  it("shows what the holder recorded", () => {
    renderForm();
    expect(screen.getByText("Oncology day unit")).toBeInTheDocument();
    expect(screen.getByText("Lung")).toBeInTheDocument();
  });

  describe("Confirming is not assessing", () => {
    it("says so", () => {
      renderForm();
      expect(
        screen.getByText(/not an assessment of their competence/),
      ).toBeInTheDocument();
    });

    it("offers no level and no declaration of competence", () => {
      renderForm();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(screen.queryByText(/accountability/i)).not.toBeInTheDocument();
    });
  });

  describe("Confirming", () => {
    it("is refused until the box is ticked", () => {
      renderForm();
      expect(
        screen.getByRole("button", { name: "Confirm entry" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("calls onConfirm once the box is ticked", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      renderForm({ onConfirm });

      await user.click(
        screen.getByRole("checkbox", {
          name: /This happened as recorded here/,
        }),
      );
      await user.click(screen.getByRole("button", { name: "Confirm entry" }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("is disabled while an answer is in flight", async () => {
      const user = userEvent.setup();
      const { rerender } = renderForm();
      await user.click(screen.getByRole("checkbox"));

      rerender(
        <LogbookConfirmationForm
          confirmation={logbookConfirmation}
          onConfirm={vi.fn()}
          onDecline={vi.fn()}
          isSubmitting
        />,
      );

      expect(
        screen.getByRole("button", { name: "Confirm entry" }),
      ).toHaveAttribute("aria-disabled", "true");
    });
  });

  it("lets the supervisor say it is not theirs to confirm", async () => {
    const user = userEvent.setup();
    const onDecline = vi.fn();
    renderForm({ onDecline });

    await user.click(
      screen.getByRole("button", { name: "Not mine to confirm" }),
    );

    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
