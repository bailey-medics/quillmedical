/**
 * CompetencyPicker Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CompetencyPicker from "./CompetencyPicker";

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

    it("renders one flat list, with no group headings", async () => {
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
