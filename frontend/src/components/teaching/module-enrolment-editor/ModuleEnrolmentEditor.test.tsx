import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import ModuleEnrolmentEditor, {
  type ModuleEnrolmentEditorProps,
} from "./ModuleEnrolmentEditor";

const academy = {
  id: 3,
  name: "Academy",
  modules: [
    { id: "colonoscopy", title: "Colonoscopy" },
    { id: "chest-xray", title: "Chest X-ray" },
  ],
};

function renderEditor(overrides: Partial<ModuleEnrolmentEditorProps> = {}) {
  const onChange = vi.fn();
  renderWithMantine(
    <ModuleEnrolmentEditor
      organisations={[academy]}
      value={{ 3: { colonoscopy: null } }}
      onChange={onChange}
      {...overrides}
    />,
  );
  return onChange;
}

function boxFor(module: string, organisation = "Academy"): HTMLInputElement {
  return screen.getByRole("checkbox", {
    name: `${module} at ${organisation}`,
  }) as HTMLInputElement;
}

describe("ModuleEnrolmentEditor", () => {
  it("draws a card for each organisation, named", () => {
    renderEditor({
      organisations: [
        academy,
        { id: 7, name: "Centre", modules: [{ id: "spiro", title: "Spiro" }] },
      ],
    });

    expect(screen.getByText("Academy")).toBeInTheDocument();
    expect(screen.getByText("Centre")).toBeInTheDocument();
    expect(boxFor("Spiro", "Centre")).toBeInTheDocument();
  });

  it("ticks the modules they are enrolled on, and no others", () => {
    renderEditor();

    expect(boxFor("Colonoscopy").checked).toBe(true);
    expect(boxFor("Chest X-ray").checked).toBe(false);
  });

  it("offers an end date only for a module that is ticked", () => {
    renderEditor();

    expect(
      screen.getByLabelText("Colonoscopy at Academy: enrolment ends"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Chest X-ray at Academy: enrolment ends"),
    ).toBeNull();
  });

  it("enrols with no end when a module is ticked", async () => {
    const onChange = renderEditor();

    await userEvent.click(boxFor("Chest X-ray"));

    expect(onChange).toHaveBeenCalledWith({
      3: { colonoscopy: null, "chest-xray": null },
    });
  });

  it("drops the module when it is unticked", async () => {
    const onChange = renderEditor();

    await userEvent.click(boxFor("Colonoscopy"));

    expect(onChange).toHaveBeenCalledWith({ 3: {} });
  });

  it("leaves another organisation's ticks alone", async () => {
    const onChange = renderEditor({
      organisations: [
        academy,
        { id: 7, name: "Centre", modules: [{ id: "spiro", title: "Spiro" }] },
      ],
      value: { 3: { colonoscopy: null }, 7: { spiro: "2027-01-01" } },
    });

    await userEvent.click(boxFor("Chest X-ray"));

    expect(onChange).toHaveBeenCalledWith({
      3: { colonoscopy: null, "chest-xray": null },
      7: { spiro: "2027-01-01" },
    });
  });

  it("shows a note under the module it is for", () => {
    renderEditor({
      note: (_organisationId, moduleId) =>
        moduleId === "colonoscopy" ? "No place at this centre." : undefined,
    });

    expect(screen.getByText("No place at this centre.")).toBeInTheDocument();
  });

  it("holds every box still when disabled", () => {
    renderEditor({ disabled: true });

    expect(boxFor("Colonoscopy")).toBeDisabled();
    expect(boxFor("Chest X-ray")).toBeDisabled();
  });
});
