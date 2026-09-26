/**
 * CompetencyPicker Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CompetencyPicker, { EVERYTHING_ELSE_GROUP } from "./CompetencyPicker";
import { specialtyGroup } from "./specialtyChoice";

describe("CompetencyPicker", () => {
  describe("The list", () => {
    it("finds a competency by searching", async () => {
      const user = userEvent.setup();
      renderWithMantine(<CompetencyPicker value={null} onChange={vi.fn()} />);

      await user.click(screen.getByRole("combobox"));
      await user.type(screen.getByRole("combobox"), "Cannula");

      expect(
        await screen.findByText("Insert Intravenous Cannula"),
      ).toBeInTheDocument();
    });

    it("never offers a software permission", async () => {
      // manage_users is a permission in Quill, not a skill anybody could
      // be assessed on, so the passport does not offer it.
      const user = userEvent.setup();
      renderWithMantine(<CompetencyPicker value={null} onChange={vi.fn()} />);

      await user.click(screen.getByRole("combobox"));
      await user.type(screen.getByRole("combobox"), "Manage User");

      expect(
        await screen.findByText("No competency found"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Manage User Accounts"),
      ).not.toBeInTheDocument();
    });

    it("renders one flat list for Generic, with no group headings", async () => {
      // A heading such as "Commonly used here" came from a site
      // shortlist that has been removed.
      const user = userEvent.setup();
      renderWithMantine(<CompetencyPicker value={null} onChange={vi.fn()} />);

      await user.click(screen.getByRole("combobox"));
      await screen.findByText("Insert Intravenous Cannula");

      expect(screen.queryByText("Commonly used here")).not.toBeInTheDocument();
      expect(screen.queryByText("All competencies")).not.toBeInTheDocument();
    });
  });

  describe("Ordered by specialty", () => {
    it("puts the specialty's common competencies first", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <CompetencyPicker
          value={null}
          onChange={vi.fn()}
          specialties={["oncology"]}
        />,
      );

      await user.click(screen.getByRole("combobox"));

      expect(await screen.findByText("Common in oncology")).toBeInTheDocument();
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveTextContent(
        "Review and prescribe systemic anti-cancer therapy",
      );
    });

    it("still offers every other assessable competency beneath", async () => {
      // A specialty orders the list; it never hides anything, so an
      // oncologist can still log a cannula.
      const user = userEvent.setup();
      renderWithMantine(
        <CompetencyPicker
          value={null}
          onChange={vi.fn()}
          specialties={["oncology"]}
        />,
      );

      await user.click(screen.getByRole("combobox"));

      expect(
        await screen.findByText(EVERYTHING_ELSE_GROUP),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Insert Intravenous Cannula"),
      ).toBeInTheDocument();
    });

    it("lists a competency common to two specialties once", async () => {
      // Consent is on both the medicine and surgery lists.
      const user = userEvent.setup();
      renderWithMantine(
        <CompetencyPicker
          value={null}
          onChange={vi.fn()}
          specialties={["general_medicine", "general_surgery"]}
        />,
      );

      await user.click(screen.getByRole("combobox"));
      await screen.findByText("Common in general medicine");

      const consent = screen
        .getAllByRole("option")
        .filter((option) => /consent/i.test(option.textContent ?? ""));
      const names = consent.map((option) => option.textContent);
      expect(new Set(names).size).toBe(names.length);
    });

    it("ignores a specialty that no longer exists", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <CompetencyPicker
          value={null}
          onChange={vi.fn()}
          specialties={["cardiology"]}
        />,
      );

      await user.click(screen.getByRole("combobox"));
      await screen.findByText("Insert Intravenous Cannula");

      expect(screen.queryByText(EVERYTHING_ELSE_GROUP)).not.toBeInTheDocument();
    });

    it("says common, never required", () => {
      // "Required" would assert a sufficiency judgement the passport
      // deliberately refuses to make.
      expect(specialtyGroup("Oncology")).toBe("Common in oncology");
      expect(specialtyGroup("Oncology")).not.toMatch(/required/i);
    });
  });

  describe("Choosing", () => {
    it("reports the chosen competency id", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithMantine(<CompetencyPicker value={null} onChange={onChange} />);

      await user.click(screen.getByRole("combobox"));
      await user.click(await screen.findByText("Insert Intravenous Cannula"));

      expect(onChange).toHaveBeenCalledWith(
        "perform_cannulation",
        expect.anything(),
      );
    });
  });

  describe("Field behaviour", () => {
    it("renders the label", () => {
      renderWithMantine(<CompetencyPicker value={null} onChange={vi.fn()} />);
      expect(screen.getByText("Competency")).toBeInTheDocument();
    });

    it("renders a description when given", () => {
      renderWithMantine(
        <CompetencyPicker
          value={null}
          onChange={vi.fn()}
          description="What you are asking to be signed off for."
        />,
      );
      expect(
        screen.getByText("What you are asking to be signed off for."),
      ).toBeInTheDocument();
    });

    it("can be disabled", () => {
      renderWithMantine(
        <CompetencyPicker value={null} onChange={vi.fn()} disabled />,
      );
      expect(screen.getByRole("combobox")).toBeDisabled();
    });
  });
});
