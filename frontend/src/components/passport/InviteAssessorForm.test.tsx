/**
 * InviteAssessorForm Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import InviteAssessorForm from "./InviteAssessorForm";

function renderForm(
  props: Partial<React.ComponentProps<typeof InviteAssessorForm>> = {},
) {
  return renderWithMantine(
    <InviteAssessorForm onSubmit={vi.fn()} {...props} />,
  );
}

/** Fills the four required fields. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: /Their name/ }),
    "Dr Amara Okonkwo",
  );
  await user.type(
    screen.getByRole("textbox", { name: /Their email/ }),
    "consultant@example.nhs.uk",
  );

  // The registration body select comes before the competency picker.
  await user.click(screen.getAllByRole("combobox")[0]);
  await user.click(await screen.findByText(/GMC — General Medical Council/));

  await user.type(
    screen.getByRole("textbox", { name: /Registration number/ }),
    "1234567",
  );
}

describe("InviteAssessorForm", () => {
  it("names the act on the button", () => {
    renderForm();
    expect(
      screen.getByRole("button", { name: "Send invitation" }),
    ).toBeInTheDocument();
  });

  describe("Quill checks no register", () => {
    it("says so rather than letting the field imply otherwise", () => {
      renderForm();
      expect(
        screen.getByText("Quill does not check the register"),
      ).toBeInTheDocument();
    });

    it("explains who confirms and who verifies", () => {
      renderForm();
      expect(
        screen.getByText(/administrator can verify it against the register/),
      ).toBeInTheDocument();
    });
  });

  describe("Registration bodies", () => {
    it("offers the bodies from the shared jurisdiction config", async () => {
      // Read from config rather than hardcoded, so adding a body stays a
      // YAML change.
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getAllByRole("combobox")[0]);

      expect(
        await screen.findByText(/GMC — General Medical Council/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/NMC — Nursing and Midwifery Council/),
      ).toBeInTheDocument();
    });
  });

  describe("The competency is optional and not kept", () => {
    it("says it is used for the email and not stored", () => {
      renderForm();
      expect(screen.getByText(/not kept afterwards/)).toBeInTheDocument();
    });

    it("submits without one", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderForm({ onSubmit });

      await fillRequired(user);
      await user.click(screen.getByRole("button", { name: "Send invitation" }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ competency_id: null }),
      );
    });
  });

  describe("Submission", () => {
    it("is disabled until the required fields are given", () => {
      renderForm();
      expect(
        screen.getByRole("button", { name: "Send invitation" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("sends the name, email and declared registration", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderForm({ onSubmit });

      await fillRequired(user);
      await user.click(screen.getByRole("button", { name: "Send invitation" }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Dr Amara Okonkwo",
          email: "consultant@example.nhs.uk",
          registration_authority: "GMC",
          registration_number: "1234567",
        }),
      );
    });

    it("disables submission while a request is running", () => {
      renderForm({ isSubmitting: true });
      expect(
        screen.getByRole("button", { name: "Send invitation" }),
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
