/**
 * SignOffRequestForm Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SignOffRequestForm from "./SignOffRequestForm";
import { requestedCompetency } from "./fixtures";

const assessors = [
  { value: "42", label: "Dr Amara Okonkwo" },
  { value: "43", label: "Dr Ravi Patel" },
];

const levels = [
  { id: "supervised", name: "Can perform with supervision available" },
  { id: "unsupervised", name: "Can perform independently" },
];

function renderForm(
  props: Partial<React.ComponentProps<typeof SignOffRequestForm>> = {},
) {
  return renderWithMantine(
    <SignOffRequestForm
      competency={requestedCompetency}
      assessors={assessors}
      onSubmit={vi.fn()}
      {...props}
    />,
  );
}

/** Names an assessor, which is required before the form will submit. */
async function chooseAssessor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("combobox")[0]);
  await user.click(await screen.findByText("Dr Amara Okonkwo"));
}

describe("SignOffRequestForm", () => {
  it("names the competency being requested", () => {
    renderForm();
    expect(
      screen.getByText(/Request sign-off for Perform thoracic ultrasound/),
    ).toBeInTheDocument();
  });

  it("names the act on the button rather than saying 'Save'", () => {
    renderForm();
    expect(
      screen.getByRole("button", { name: "Request sign-off" }),
    ).toBeInTheDocument();
  });

  describe("Choosing an assessor", () => {
    it("offers every assessor given, filtering nobody out", async () => {
      // Who is fit to assess whom is a clinical judgement, not a rule
      // table. The form presents the list it is handed.
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getAllByRole("combobox")[0]);

      expect(await screen.findByText("Dr Amara Okonkwo")).toBeInTheDocument();
      expect(screen.getByText("Dr Ravi Patel")).toBeInTheDocument();
    });
  });

  describe("Submission is refused until the required fields are given", () => {
    it("is disabled before anything is filled in", () => {
      renderForm();
      expect(
        screen.getByRole("button", { name: "Request sign-off" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("stays disabled with an assessor but no observed date", async () => {
      const user = userEvent.setup();
      renderForm();

      await chooseAssessor(user);

      expect(
        screen.getByRole("button", { name: "Request sign-off" }),
      ).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("Levels", () => {
    it("offers a level picker only when the competency declares levels", () => {
      renderForm({ levels });
      expect(screen.getAllByRole("combobox")).toHaveLength(2);
    });

    it("shows only the assessor picker when there are no levels", () => {
      renderForm();
      expect(screen.getAllByRole("combobox")).toHaveLength(1);
    });
  });

  describe("The observed date", () => {
    it("is labelled as when the work happened, not when asking", () => {
      renderForm();
      expect(
        screen.getByText(
          /The day the work happened, not the day you are asking/,
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Anonymisation", () => {
    it("reminds the holder not to write about a patient", () => {
      // Reflections are one of only two places patient data could enter
      // a passport.
      renderForm();
      expect(
        screen.getByText(/Write about the work, not about a patient/),
      ).toBeInTheDocument();
    });
  });

  describe("In flight", () => {
    it("disables submission while a request is running", () => {
      renderForm({ isSubmitting: true });
      expect(
        screen.getByRole("button", { name: "Request sign-off" }),
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
