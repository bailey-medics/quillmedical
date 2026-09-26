/**
 * PassportSpecialtyCard Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import PassportSpecialtyCard from "./PassportSpecialtyCard";
import { GENERIC_LABEL } from "./specialtyChoice";

describe("PassportSpecialtyCard", () => {
  it("says what a specialty does, and that nothing is hidden", () => {
    renderWithMantine(
      <PassportSpecialtyCard value={["oncology"]} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Passport specialty")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is hidden/)).toBeInTheDocument();
  });

  // The chosen values show as pills; the same words also sit in the
  // closed dropdown, so the pills are read directly.
  function pills(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll(".mantine-Pill-label")).map(
      (pill) => pill.textContent ?? "",
    );
  }

  it("shows the current specialty", () => {
    const { container } = renderWithMantine(
      <PassportSpecialtyCard value={["oncology"]} onChange={vi.fn()} />,
    );

    expect(pills(container)).toEqual(["Oncology"]);
  });

  it("shows Generic when there is no specialty", () => {
    const { container } = renderWithMantine(
      <PassportSpecialtyCard value={[]} onChange={vi.fn()} />,
    );

    expect(pills(container)).toEqual([GENERIC_LABEL]);
  });

  it("reports a change to Generic", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(
      <PassportSpecialtyCard value={["oncology"]} onChange={onChange} />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: GENERIC_LABEL }),
    );

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("never reports an unanswered choice", async () => {
    // Removing the last pill would leave no answer, which a passport
    // cannot hold. Generic is how to have no specialty order.
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(
      <PassportSpecialtyCard value={["oncology"]} onChange={onChange} />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Oncology" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("is disabled, and says why, while the passport is read-only", () => {
    renderWithMantine(
      <PassportSpecialtyCard value={[]} onChange={vi.fn()} disabled />,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByText(/read-only at the moment/)).toBeInTheDocument();
  });

  it("shows why a change was not saved", () => {
    renderWithMantine(
      <PassportSpecialtyCard
        value={[]}
        onChange={vi.fn()}
        error="Your specialty could not be saved."
      />,
    );

    expect(
      screen.getByText("Your specialty could not be saved."),
    ).toBeInTheDocument();
  });
});
