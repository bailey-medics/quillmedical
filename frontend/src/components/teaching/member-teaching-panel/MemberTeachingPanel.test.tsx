import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import type { ModuleAccess } from "@/domains/teachingDoor";
import MemberTeachingPanel, {
  type MemberTeachingPanelProps,
} from "./MemberTeachingPanel";

const organisation = {
  id: 3,
  name: "Academy",
  modules: [
    { id: "colonoscopy", title: "Colonoscopy" },
    { id: "chest-xray", title: "Chest X-ray" },
  ],
};

function module(
  id: string,
  missing: ModuleAccess["missing"],
  endsOn: string | null = null,
): ModuleAccess {
  return {
    question_bank_id: id,
    title: id,
    may_enter: missing.length === 0,
    missing,
    enrolment_ends_on: endsOn,
  };
}

function renderPanel(overrides: Partial<MemberTeachingPanelProps> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderWithRouter(
    <MemberTeachingPanel
      organisation={organisation}
      access={[module("colonoscopy", []), module("chest-xray", ["enrolment"])]}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onSave };
}

function box(name: string): HTMLInputElement {
  return screen.getByRole("checkbox", {
    name: `${name} at Academy`,
  }) as HTMLInputElement;
}

describe("MemberTeachingPanel", () => {
  it("ticks what they are enrolled on", () => {
    renderPanel();

    expect(box("Colonoscopy").checked).toBe(true);
    expect(box("Chest X-ray").checked).toBe(false);
  });

  it("says a module they are enrolled on can be entered", () => {
    renderPanel();

    expect(screen.getByText("Can enter this module.")).toBeInTheDocument();
  });

  it("names the missing layer for somebody enrolled who cannot enter", () => {
    renderPanel({
      access: [
        module("colonoscopy", ["competency", "place"]),
        module("chest-xray", ["competency", "place", "enrolment"]),
      ],
    });

    expect(
      screen.getByText(
        "Enrolled, but cannot enter yet: may not take modules, no place at this centre.",
      ),
    ).toBeInTheDocument();
    // Nothing is said under a module they are simply not on.
    expect(screen.queryByText(/not enrolled/)).toBeNull();
  });

  it("calls nothing until Save enrolment is pressed", async () => {
    const { onSave } = renderPanel();

    await userEvent.click(box("Chest X-ray"));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves a module ticked as one to enrol on", async () => {
    const { onSave } = renderPanel();

    await userEvent.click(box("Chest X-ray"));
    await userEvent.click(
      screen.getByRole("button", { name: "Save enrolment" }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        enrol: [{ moduleId: "chest-xray", endsOn: null }],
        unenrol: [],
      }),
    );
  });

  it("saves a module unticked as one to take them off", async () => {
    const { onSave } = renderPanel();

    await userEvent.click(box("Colonoscopy"));
    await userEvent.click(
      screen.getByRole("button", { name: "Save enrolment" }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        enrol: [],
        unenrol: ["colonoscopy"],
      }),
    );
  });

  it("says why when the save fails", async () => {
    renderPanel({
      onSave: vi
        .fn()
        .mockRejectedValue(new Error("Chest X-ray could not be saved.")),
    });

    await userEvent.click(box("Chest X-ray"));
    await userEvent.click(
      screen.getByRole("button", { name: "Save enrolment" }),
    );

    expect(
      await screen.findByText("Chest X-ray could not be saved."),
    ).toBeInTheDocument();
    // The tick stays as the admin set it, so saving again finishes it.
    expect(box("Chest X-ray").checked).toBe(true);
  });

  it("has no second way to stop them: the tick is the only switch", () => {
    renderPanel();

    expect(screen.queryByRole("button", { name: /withdraw/i })).toBeNull();
  });
});
