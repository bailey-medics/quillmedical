/**
 * SignOffForm Component Tests
 *
 * Most of these guard the declaration, because it is what the assessor
 * is putting their name to and the API refuses a sign-off without it.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SignOffForm from "./SignOffForm";
import { requested } from "./fixtures";

/** Chooses a basis, which is required before the form will submit. */
async function chooseBasis(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox"));
  await user.click(await screen.findByText("Directly observed"));
}

describe("SignOffForm", () => {
  it("names the competency being signed off", () => {
    renderWithMantine(<SignOffForm signOff={requested} onSubmit={vi.fn()} />);
    expect(
      screen.getByText(/Sign off Perform thoracic ultrasound/),
    ).toBeInTheDocument();
  });

  it("names the act on the button rather than saying 'Save'", () => {
    renderWithMantine(<SignOffForm signOff={requested} onSubmit={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Sign off competency" }),
    ).toBeInTheDocument();
  });

  describe("The declaration", () => {
    it("shows the declaration wording", () => {
      renderWithMantine(<SignOffForm signOff={requested} onSubmit={vi.fn()} />);
      expect(
        screen.getAllByText(/accept professional accountability/).length,
      ).toBeGreaterThan(0);
    });

    it("starts unticked", () => {
      // Never pre-ticked: the deliberate act is the whole point.
      renderWithMantine(<SignOffForm signOff={requested} onSubmit={vi.fn()} />);
      expect(screen.getByRole("checkbox")).not.toBeChecked();
    });

    it("offers no drawn or uploaded signature", () => {
      // A scribble looks more official and proves less; an uploaded image
      // is a reusable credential. See the plan's decision.
      renderWithMantine(<SignOffForm signOff={requested} onSubmit={vi.fn()} />);
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(document.querySelector("canvas")).not.toBeInTheDocument();
      expect(
        document.querySelector('input[type="file"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe("Submission is refused until both are given", () => {
    it("is disabled before anything is filled in", () => {
      renderWithMantine(<SignOffForm signOff={requested} onSubmit={vi.fn()} />);
      expect(
        screen.getByRole("button", { name: "Sign off competency" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("stays disabled with a basis but no confirmation", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SignOffForm signOff={requested} onSubmit={vi.fn()} />);

      await chooseBasis(user);

      expect(
        screen.getByRole("button", { name: "Sign off competency" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("stays disabled with a confirmation but no basis", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SignOffForm signOff={requested} onSubmit={vi.fn()} />);

      await user.click(screen.getByRole("checkbox"));

      expect(
        screen.getByRole("button", { name: "Sign off competency" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("enables once both are given", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SignOffForm signOff={requested} onSubmit={vi.fn()} />);

      await chooseBasis(user);
      await user.click(screen.getByRole("checkbox"));

      expect(
        screen.getByRole("button", { name: "Sign off competency" }),
      ).not.toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("What it submits", () => {
    it("sends the basis and the confirmed declaration", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderWithMantine(
        <SignOffForm signOff={requested} onSubmit={onSubmit} />,
      );

      await chooseBasis(user);
      await user.click(screen.getByRole("checkbox"));
      await user.click(
        screen.getByRole("button", { name: "Sign off competency" }),
      );

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          meaning: "directly observed",
          declaration_confirmed: true,
        }),
      );
    });

    it("sends caveats and assessment notes when given", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderWithMantine(
        <SignOffForm signOff={requested} onSubmit={onSubmit} />,
      );

      await chooseBasis(user);
      // Two text areas render: caveats first, then assessment notes.
      await user.type(screen.getAllByRole("textbox")[0], "Supervised only");
      await user.click(screen.getByRole("checkbox"));
      await user.click(
        screen.getByRole("button", { name: "Sign off competency" }),
      );

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ comments: "Supervised only" }),
      );
    });

    it("sends null rather than an empty string for untouched optional fields", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderWithMantine(
        <SignOffForm signOff={requested} onSubmit={onSubmit} />,
      );

      await chooseBasis(user);
      await user.click(screen.getByRole("checkbox"));
      await user.click(
        screen.getByRole("button", { name: "Sign off competency" }),
      );

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ comments: null, assessment: null }),
      );
    });
  });

  describe("In flight", () => {
    it("disables submission while a request is running", () => {
      renderWithMantine(
        <SignOffForm signOff={requested} onSubmit={vi.fn()} isSubmitting />,
      );
      expect(
        screen.getByRole("button", { name: "Sign off competency" }),
      ).toHaveAttribute("aria-disabled", "true");
    });
  });

  it("calls onCancel when the assessor backs out", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithMantine(
      <SignOffForm
        signOff={requested}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
