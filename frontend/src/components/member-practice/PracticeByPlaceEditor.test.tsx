/**
 * Practice-by-place editor tests.
 *
 * Covers one card per org_unit with a switch per competency, that a
 * switch reports the whole of the choices and changes only its own
 * org_unit, that a switch the viewer may not move is shown disabled, and
 * what is said when there is nothing to set.
 */

import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import PracticeByPlaceEditor, {
  type PracticeByPlaceEditorProps,
} from "./PracticeByPlaceEditor";

const trust = { id: 3, name: "Trust", type: "organisation" };
const ward = { id: 4, name: "Ward A", type: "ward" };

function renderEditor(overrides: Partial<PracticeByPlaceEditorProps> = {}) {
  const onChange = vi.fn();
  renderWithRouter(
    <PracticeByPlaceEditor
      places={[trust, ward]}
      competencies={["perform_venepuncture", "certify_death"]}
      value={{ 3: ["perform_venepuncture"], 4: [] }}
      onChange={onChange}
      {...overrides}
    />,
  );
  return onChange;
}

function switchFor(competency: string, place: string): HTMLInputElement {
  return screen.getByRole("switch", {
    name: `${competency} at ${place}: may practise here`,
  }) as HTMLInputElement;
}

describe("PracticeByPlaceEditor", () => {
  describe("What it lists", () => {
    it("gives each org_unit a card of its own", () => {
      renderEditor();

      expect(screen.getByRole("heading", { name: "Trust" })).toBeVisible();
      expect(screen.getByRole("heading", { name: "Ward A" })).toBeVisible();
    });

    it("gives each competency a switch at each org_unit, set from the value", () => {
      renderEditor();

      expect(switchFor("Perform Venepuncture", "Trust").checked).toBe(true);
      expect(switchFor("Certify Death", "Trust").checked).toBe(false);
      expect(switchFor("Perform Venepuncture", "Ward A").checked).toBe(false);
      expect(switchFor("Certify Death", "Ward A").checked).toBe(false);
    });

    it("lists the competencies by name, in order", () => {
      renderEditor();

      const card = screen
        .getByRole("heading", { name: "Trust" })
        .closest(".mantine-Card-root") as HTMLElement;
      const names = within(card)
        .getAllByRole("switch")
        .map((input) => input.getAttribute("aria-label"));
      expect(names).toEqual([
        "Certify Death at Trust: may practise here",
        "Perform Venepuncture at Trust: may practise here",
      ]);
    });
  });

  describe("Moving a switch", () => {
    it("switches on at one org_unit and leaves the other alone", async () => {
      const user = userEvent.setup();
      const onChange = renderEditor();

      await user.click(switchFor("Certify Death", "Ward A"));

      expect(onChange).toHaveBeenCalledWith({
        3: ["perform_venepuncture"],
        4: ["certify_death"],
      });
    });

    it("switches off, leaving an empty list and not a missing one", async () => {
      const user = userEvent.setup();
      const onChange = renderEditor();

      await user.click(switchFor("Perform Venepuncture", "Trust"));

      expect(onChange).toHaveBeenCalledWith({ 3: [], 4: [] });
    });

    it("starts an org_unit that has no entry yet", async () => {
      const user = userEvent.setup();
      const onChange = renderEditor({ value: {} });

      await user.click(switchFor("Certify Death", "Trust"));

      expect(onChange).toHaveBeenCalledWith({ 3: ["certify_death"] });
    });
  });

  describe("What the viewer may not change", () => {
    it("shows a switch they may not move, disabled", () => {
      renderEditor({
        mayChange: (competency) => competency === "certify_death",
      });

      expect(switchFor("Perform Venepuncture", "Trust")).toBeDisabled();
      expect(switchFor("Perform Venepuncture", "Trust").checked).toBe(true);
      expect(switchFor("Certify Death", "Trust")).toBeEnabled();
    });

    it("holds every switch still when disabled", () => {
      renderEditor({ disabled: true });

      for (const input of screen.getAllByRole("switch")) {
        expect(input).toBeDisabled();
      }
    });
  });

  describe("Nothing to set", () => {
    it("says so when they are at no org_unit yet", () => {
      renderEditor({ places: [], value: {} });

      expect(
        screen.getByText(/not at an organisation or site yet/),
      ).toBeVisible();
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    });

    it("says so when they will hold no competencies", () => {
      renderEditor({ competencies: [] });

      expect(screen.getByText(/will hold no competencies/)).toBeVisible();
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    });

    it("offers no switch at a type of org_unit nobody practises at", () => {
      renderEditor({ places: [{ id: 9, name: "Room 4", type: "room" }] });

      expect(screen.getByRole("heading", { name: "Room 4" })).toBeVisible();
      expect(
        screen.getByText(/Nobody is authorised to practise at this kind/),
      ).toBeVisible();
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    });
  });
});
