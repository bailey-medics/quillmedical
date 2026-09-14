/**
 * CpdEntryForm Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CpdEntryForm from "./CpdEntryForm";

function renderForm(
  props: Partial<React.ComponentProps<typeof CpdEntryForm>> = {},
) {
  return renderWithMantine(<CpdEntryForm onSubmit={vi.fn()} {...props} />);
}

describe("CpdEntryForm", () => {
  it("names the act on the button rather than saying 'Save'", () => {
    renderForm();
    expect(
      screen.getByRole("button", { name: "Record activity" }),
    ).toBeInTheDocument();
  });

  describe("Self-declared, like the logbook", () => {
    it("asks for no declaration", () => {
      // Nobody countersigns a CPD entry. Only a sign-off carries a
      // declaration, because only a sign-off has a second person
      // accepting accountability.
      renderForm();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("names no assessor", () => {
      renderForm();
      expect(screen.queryByText(/assessor/i)).not.toBeInTheDocument();
    });
  });

  describe("Points", () => {
    it("offers a points field, since points is the common usage", () => {
      // One point is one hour, and points is the unit end to end: the
      // form, the API and the record model all name the field `points`.
      renderForm();
      expect(
        screen.getByRole("spinbutton", { name: /Points/ }),
      ).toBeInTheDocument();
    });

    it("explains the unit, so nobody has to guess", () => {
      renderForm();
      expect(screen.getByText(/One point is one hour/)).toBeInTheDocument();
    });

    it("never totals them on the form", () => {
      // A form records one activity; what a year adds up to belongs to
      // the table, and the yearly tally is still an open question.
      renderForm();
      expect(screen.queryByText(/total/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });
  });

  describe("Activity types", () => {
    it("offers every type the record model allows", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole("combobox"));

      expect(await screen.findByText("Conference")).toBeInTheDocument();
      expect(screen.getByText("Grand round")).toBeInTheDocument();
      expect(screen.getByText("Teaching day")).toBeInTheDocument();
      expect(screen.getByText("Course")).toBeInTheDocument();
      expect(screen.getByText("Other")).toBeInTheDocument();
    });
  });

  describe("The date decides the appraisal year", () => {
    it("says so in the description", () => {
      renderForm();
      expect(
        screen.getByText(/This decides the appraisal year it is filed under/),
      ).toBeInTheDocument();
    });
  });

  describe("Anonymisation", () => {
    it("reminds the holder not to write about a patient", () => {
      renderForm();
      expect(
        screen.getByText(/Write about the activity, not about a patient/),
      ).toBeInTheDocument();
    });
  });

  describe("Submission", () => {
    it("is disabled until the required fields are given", () => {
      renderForm();
      expect(
        screen.getByRole("button", { name: "Record activity" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("stays disabled with a title but no date or type", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(
        screen.getByRole("textbox", { name: /What was it/ }),
        "Respiratory conference",
      );

      expect(
        screen.getByRole("button", { name: "Record activity" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("disables submission while a request is running", () => {
      renderForm({ isSubmitting: true });
      expect(
        screen.getByRole("button", { name: "Record activity" }),
      ).toHaveAttribute("aria-disabled", "true");
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
