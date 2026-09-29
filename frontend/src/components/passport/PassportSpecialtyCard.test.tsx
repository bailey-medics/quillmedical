/**
 * PassportSpecialtyCard Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import { PASSPORT_SPECIALTIES } from "@lib/passport/specialties";
import PassportSpecialtyCard from "./PassportSpecialtyCard";
import { GENERIC_LABEL } from "./specialtyChoice";

describe("PassportSpecialtyCard", () => {
  it("is titled, with no helper text and no subtitle", () => {
    renderWithRouter(
      <PassportSpecialtyCard
        options={PASSPORT_SPECIALTIES}
        value={["oncology"]}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Clinician passport" }),
    ).toBeInTheDocument();
    // Removed to slim the card down: the label says enough.
    expect(screen.queryByText("Choose one or more")).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing is hidden/)).not.toBeInTheDocument();
  });

  // The chosen values show as pills; the same words also sit in the
  // closed dropdown, so the pills are read directly.
  function pills(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll(".mantine-Pill-label")).map(
      (pill) => pill.textContent ?? "",
    );
  }

  it("shows the current specialty", () => {
    const { container } = renderWithRouter(
      <PassportSpecialtyCard
        options={PASSPORT_SPECIALTIES}
        value={["oncology"]}
        onChange={vi.fn()}
      />,
    );

    expect(pills(container)).toEqual(["Oncology"]);
  });

  it("shows Generic when there is no specialty", () => {
    const { container } = renderWithRouter(
      <PassportSpecialtyCard
        options={PASSPORT_SPECIALTIES}
        value={[]}
        onChange={vi.fn()}
      />,
    );

    expect(pills(container)).toEqual([GENERIC_LABEL]);
  });

  it("reports a change to Generic", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithRouter(
      <PassportSpecialtyCard
        options={PASSPORT_SPECIALTIES}
        value={["oncology"]}
        onChange={onChange}
      />,
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
    renderWithRouter(
      <PassportSpecialtyCard
        options={PASSPORT_SPECIALTIES}
        value={["oncology"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Oncology" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("is disabled, and says why, while the passport is read-only", () => {
    renderWithRouter(
      <PassportSpecialtyCard
        options={PASSPORT_SPECIALTIES}
        value={[]}
        onChange={vi.fn()}
        disabled
      />,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByText(/read-only at the moment/)).toBeInTheDocument();
  });

  it("links to the CPD date ranges page", () => {
    renderWithRouter(
      <PassportSpecialtyCard
        options={PASSPORT_SPECIALTIES}
        value={[]}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("link", { name: "CPD date ranges" }),
    ).toHaveAttribute("href", "/settings/cpd-date-ranges");
  });

  it("keeps that link while the passport is read-only", () => {
    // The page still shows the ranges, and says why they cannot change.
    renderWithRouter(
      <PassportSpecialtyCard
        options={PASSPORT_SPECIALTIES}
        value={[]}
        onChange={vi.fn()}
        disabled
      />,
    );

    expect(
      screen.getByRole("link", { name: "CPD date ranges" }),
    ).toHaveAttribute("href", "/settings/cpd-date-ranges");
  });

  it("shows why a change was not saved", () => {
    renderWithRouter(
      <PassportSpecialtyCard
        options={PASSPORT_SPECIALTIES}
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
