/**
 * LogbookEntryForm Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import LogbookEntryForm from "./LogbookEntryForm";
import { signedOffCompetency } from "./fixtures";

const scopes = [
  { id: "breast", name: "Breast" },
  { id: "lung", name: "Lung" },
  { id: "other", name: "Other" },
];

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

  describe("Asking a supervisor to confirm it", () => {
    it("is optional, and sends nobody when left empty", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderForm({ onSubmit });

      await user.type(
        screen.getByRole("textbox", { name: /Performed on/ }),
        "14/03/2026",
      );
      await user.click(screen.getByRole("button", { name: "Add entry" }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ confirmer_email: null }),
      );
    });

    it("sends the address, trimmed and folded to lower case", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderForm({ onSubmit });

      await user.type(
        screen.getByRole("textbox", { name: /Performed on/ }),
        "14/03/2026",
      );
      await user.type(
        screen.getByRole("textbox", { name: /Ask a supervisor/ }),
        " Amara.Okonkwo@Example.nhs.uk ",
      );
      await user.click(screen.getByRole("button", { name: "Add entry" }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmer_email: "amara.okonkwo@example.nhs.uk",
        }),
      );
    });

    it("will not send a half-typed address", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(
        screen.getByRole("textbox", { name: /Performed on/ }),
        "14/03/2026",
      );
      await user.type(
        screen.getByRole("textbox", { name: /Ask a supervisor/ }),
        "amara",
      );

      expect(screen.getByRole("button", { name: "Add entry" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("warns that saving a confirmed entry removes the confirmation", () => {
      renderForm({
        initial: {
          filename: "20260314T1432",
          competency: "prescribe_sact",
          performed_on: "2026-03-14",
          setting: null,
          supervision: null,
          supervisor: null,
          indication: null,
          outcome: null,
          notes: null,
          also_counts_towards: [],
          attachments: [],
          confirmed_by: {
            user_id: "42",
            name: "Dr Amara Okonkwo",
            role: "Consultant",
            registrations: [],
            care_location: null,
          },
          confirmed_at: "2026-03-14T14:32:07.000Z",
        },
      });

      expect(
        screen.getByText(/Dr Amara Okonkwo confirmed this entry/),
      ).toBeInTheDocument();
    });
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

  describe("Scope", () => {
    it("is offered only where the competency declares scopes", () => {
      renderForm();
      expect(
        screen.queryByRole("combobox", { name: /What it counts towards/ }),
      ).not.toBeInTheDocument();
    });

    it("can be left empty, unlike on a sign-off", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderForm({ scopes, onSubmit });

      await user.type(
        screen.getByRole("textbox", { name: /Performed on/ }),
        "14/03/2026",
      );
      await user.click(screen.getByRole("button", { name: "Add entry" }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ scope_id: null }),
      );
    });

    it("sends the scope chosen", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderForm({ scopes, onSubmit });

      await user.type(
        screen.getByRole("textbox", { name: /Performed on/ }),
        "14/03/2026",
      );
      await user.click(
        screen.getByRole("combobox", { name: /What it counts towards/ }),
      );
      await user.click(await screen.findByText("Lung"));
      await user.click(screen.getByRole("button", { name: "Add entry" }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ scope_id: "lung" }),
      );
    });

    it("starts from the scope an entry already names", () => {
      renderForm({
        scopes,
        initial: {
          filename: "20260314T1432",
          competency: "prescribe_sact",
          performed_on: "2026-03-14",
          scope: { id: "breast", name: "Breast" },
          setting: null,
          supervision: null,
          supervisor: null,
          indication: null,
          outcome: null,
          notes: null,
          also_counts_towards: [],
          attachments: [],
        },
      });

      expect(
        screen.getByRole("combobox", { name: /What it counts towards/ }),
      ).toHaveValue("Breast");
    });
  });

  describe("Editing an entry", () => {
    const initial = {
      filename: "20260314T1432",
      competency: signedOffCompetency.id,
      performed_on: "2026-03-14",
      setting: "Bronchoscopy suite",
      supervision: "supervised" as const,
      supervisor: "Dr Okonkwo",
      indication: null,
      outcome: "Biopsies taken",
      notes: null,
      also_counts_towards: [],
      attachments: [],
    };

    it("starts filled in, and says it is saving rather than adding", () => {
      renderWithMantine(
        <LogbookEntryForm
          competency={signedOffCompetency}
          initial={initial}
          onSubmit={vi.fn()}
        />,
      );

      expect(screen.getByText(/^Edit this .* entry$/)).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /Outcome/ })).toHaveValue(
        "Biopsies taken",
      );
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeInTheDocument();
    });

    it("sends the entry as corrected", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderWithMantine(
        <LogbookEntryForm
          competency={signedOffCompetency}
          initial={initial}
          onSubmit={onSubmit}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          performed_on: "2026-03-14",
          setting: "Bronchoscopy suite",
          supervision: "supervised",
          outcome: "Biopsies taken",
        }),
      );
    });
  });
});
