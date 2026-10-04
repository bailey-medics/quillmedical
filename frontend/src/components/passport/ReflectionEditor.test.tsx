/**
 * ReflectionEditor Component Tests
 *
 * Most of these guard the anonymisation declaration, which is what keeps
 * patient data out of a reflection.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import ReflectionEditor, {
  ANONYMISATION_DECLARATION,
} from "./ReflectionEditor";

function renderEditor(
  props: Partial<React.ComponentProps<typeof ReflectionEditor>> = {},
) {
  return renderWithMantine(<ReflectionEditor onSubmit={vi.fn()} {...props} />);
}

describe("ReflectionEditor", () => {
  it("names the act on the button rather than saying 'Save' alone", () => {
    renderEditor();
    expect(
      screen.getByRole("button", { name: "Save reflection" }),
    ).toBeInTheDocument();
  });

  it("makes no claim about who can read it", () => {
    renderEditor();
    expect(
      screen.queryByText("Only you can read this"),
    ).not.toBeInTheDocument();
  });

  describe("The anonymisation declaration", () => {
    it("shows the declaration wording", () => {
      renderEditor();
      expect(screen.getByText(ANONYMISATION_DECLARATION)).toBeInTheDocument();
    });

    it("names what must not appear rather than gesturing at it", () => {
      // Firmer than the logbook's passive note, deliberately.
      expect(ANONYMISATION_DECLARATION).toContain("no NHS number");
      expect(ANONYMISATION_DECLARATION).toContain("no date of birth");
    });

    it("warns about the detail that singles somebody out", () => {
      // The subtle case: no identifier, but an unmistakable presentation.
      expect(ANONYMISATION_DECLARATION).toContain("single somebody out");
    });

    it("starts unticked", () => {
      renderEditor();
      expect(screen.getByRole("checkbox")).not.toBeChecked();
    });
  });

  describe("Submission is refused until everything is given", () => {
    it("is disabled before anything is filled in", () => {
      renderEditor();
      expect(
        screen.getByRole("button", { name: "Save reflection" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("stays disabled when the anonymisation tick is missing", async () => {
      // The API refuses without it, so the form must not offer to try.
      const user = userEvent.setup();
      renderEditor();

      await user.type(
        screen.getByRole("textbox", { name: /Title/ }),
        "Difficult airway",
      );
      await user.type(
        screen.getByRole("textbox", { name: /Your reflection/ }),
        "What I took from it.",
      );

      expect(
        screen.getByRole("button", { name: "Save reflection" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("disables submission while a request is running", () => {
      renderEditor({ isSubmitting: true });
      expect(
        screen.getByRole("button", { name: "Save reflection" }),
      ).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("Self-declared", () => {
    it("offers no assessor to send it to", () => {
      // Nobody countersigns a reflection.
      renderEditor();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("asks for no declaration of accountability", () => {
      // The only checkbox is the anonymisation one. A reflection carries
      // no second person accepting responsibility for a judgement.
      renderEditor();
      expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    });
  });

  it("calls onCancel when the holder backs out", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderEditor({ onCancel });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
