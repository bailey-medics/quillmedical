/**
 * LogbookEntryForm Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import LogbookEntryForm from "./LogbookEntryForm";
import { signedOffCompetency } from "./fixtures";

function renderForm(
  props: Partial<React.ComponentProps<typeof LogbookEntryForm>> = {},
) {
  return renderWithMantine(
    <LogbookEntryForm
      competency={signedOffCompetency}
      onSubmit={vi.fn()}
      {...props}
    />,
  );
}

describe("LogbookEntryForm", () => {
  it("names the competency the entry counts towards", () => {
    renderForm();
    expect(
      screen.getByText(/Add a Perform bronchoscopy entry/),
    ).toBeInTheDocument();
  });

  it("names the act on the button rather than saying 'Save'", () => {
    renderForm();
    expect(
      screen.getByRole("button", { name: "Add entry" }),
    ).toBeInTheDocument();
  });

  describe("Self-declared, and nothing pretends otherwise", () => {
    it("asks for no declaration", () => {
      // A logbook entry is the holder's own claim. Only a sign-off
      // carries a declaration, because only a sign-off has a second
      // person accepting accountability.
      renderForm();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("names no assessor", () => {
      renderForm();
      expect(screen.queryByText(/assessor/i)).not.toBeInTheDocument();
    });

    it("shows no target, count or progress", () => {
      // Two hundred bronchoscopies prove activity, not competence.
      renderForm();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
      expect(screen.queryByText(/of \d+/)).not.toBeInTheDocument();
    });
  });

  describe("Recording what happened", () => {
    it("offers an outcome field that does not presume success", () => {
      // Failures are recorded like anything else: free text, never a
      // success flag.
      renderForm();
      expect(
        screen.getByText(/including where it did not go to plan/),
      ).toBeInTheDocument();
    });

    it("offers both supervision states without ranking them", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole("combobox"));

      expect(await screen.findByText("Supervised")).toBeInTheDocument();
      expect(screen.getByText("Independent")).toBeInTheDocument();
    });
  });

  describe("Anonymisation", () => {
    it("reminds the holder not to write about a patient", () => {
      renderForm();
      expect(
        screen.getByText(/Write about the procedure, not about a patient/),
      ).toBeInTheDocument();
    });

    it("warns against a patient identifier on the indication", () => {
      renderForm();
      expect(
        screen.getByText(/never a patient identifier/),
      ).toBeInTheDocument();
    });
  });

  describe("Submission", () => {
    it("is disabled until a date is given", () => {
      renderForm();
      expect(screen.getByRole("button", { name: "Add entry" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("disables submission while a request is running", () => {
      renderForm({ isSubmitting: true });
      expect(screen.getByRole("button", { name: "Add entry" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
  });

  it("calls onCancel when the holder backs out", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderForm({ onCancel });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
