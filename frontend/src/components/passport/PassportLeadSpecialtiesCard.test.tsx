/**
 * PassportLeadSpecialtiesCard Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { PASSPORT_SPECIALTIES } from "@lib/passport/specialties";
import PassportLeadSpecialtiesCard from "./PassportLeadSpecialtiesCard";

// The chosen values show as pills; the same words also sit in the closed
// dropdown, so the pills are read directly.
function pills(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".mantine-Pill-label")).map(
    (pill) => pill.textContent ?? "",
  );
}

describe("PassportLeadSpecialtiesCard", () => {
  it("is titled, and says what the leads do", () => {
    renderWithMantine(
      <PassportLeadSpecialtiesCard
        options={PASSPORT_SPECIALTIES}
        value={[]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Passport specialties")).toBeInTheDocument();
    expect(screen.getByText(/Listed first, in this order/)).toBeInTheDocument();
  });

  it("shows the leads in their order", () => {
    const { container } = renderWithMantine(
      <PassportLeadSpecialtiesCard
        options={PASSPORT_SPECIALTIES}
        value={["oncology", "general_medicine"]}
        onChange={vi.fn()}
      />,
    );

    expect(pills(container)).toEqual(["Oncology", "General medicine"]);
  });

  it("says the list is alphabetical when none are set", () => {
    renderWithMantine(
      <PassportLeadSpecialtiesCard
        options={PASSPORT_SPECIALTIES}
        value={[]}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByPlaceholderText("None: the list is alphabetical"),
    ).toBeInTheDocument();
  });

  it("adds a picked specialty at the end", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(
      <PassportLeadSpecialtiesCard
        options={PASSPORT_SPECIALTIES}
        value={["oncology"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "General surgery" }),
    );

    expect(onChange).toHaveBeenCalledWith(["oncology", "general_surgery"]);
  });

  it("still chooses a specialty with the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(
      <PassportLeadSpecialtiesCard
        options={PASSPORT_SPECIALTIES}
        value={[]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("option", { name: "General medicine" });
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith(["general_medicine"]);
  });

  it("does not submit a surrounding form on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    renderWithMantine(
      <form onSubmit={onSubmit}>
        <PassportLeadSpecialtiesCard
          options={PASSPORT_SPECIALTIES}
          value={["oncology"]}
          onChange={vi.fn()}
        />
      </form>,
    );

    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Escape}{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps a saved lead that is no longer offered, so it can be removed", () => {
    const { container } = renderWithMantine(
      <PassportLeadSpecialtiesCard
        options={PASSPORT_SPECIALTIES}
        value={["cardiology", "oncology"]}
        onChange={vi.fn()}
      />,
    );

    expect(pills(container)).toEqual([
      "cardiology (no longer offered)",
      "Oncology",
    ]);
  });

  it("shows why a change was not saved", () => {
    renderWithMantine(
      <PassportLeadSpecialtiesCard
        options={PASSPORT_SPECIALTIES}
        value={["oncology"]}
        onChange={vi.fn()}
        error="The lead specialties could not be saved. Please try again."
      />,
    );

    expect(
      screen.getByText(
        "The lead specialties could not be saved. Please try again.",
      ),
    ).toBeInTheDocument();
  });

  it("can be disabled while the saved list loads", () => {
    renderWithMantine(
      <PassportLeadSpecialtiesCard
        options={PASSPORT_SPECIALTIES}
        value={[]}
        onChange={vi.fn()}
        disabled
      />,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
