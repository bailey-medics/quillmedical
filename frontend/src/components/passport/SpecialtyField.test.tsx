/**
 * SpecialtyField Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SpecialtyField from "./SpecialtyField";
import {
  GENERIC_CHOICE,
  GENERIC_LABEL,
  nextSpecialtyValue,
} from "./specialtyChoice";

describe("nextSpecialtyValue", () => {
  it("is unanswered when nothing is selected", () => {
    expect(nextSpecialtyValue(["oncology"], [])).toBeNull();
  });

  it("is Generic, an empty list, when Generic is chosen", () => {
    expect(nextSpecialtyValue(null, [GENERIC_CHOICE])).toEqual([]);
  });

  it("clears the specialties when Generic is added", () => {
    expect(
      nextSpecialtyValue(["oncology"], ["oncology", GENERIC_CHOICE]),
    ).toEqual([]);
  });

  it("clears Generic when a specialty is added", () => {
    expect(nextSpecialtyValue([], [GENERIC_CHOICE, "oncology"])).toEqual([
      "oncology",
    ]);
  });

  it("keeps several specialties in the order chosen", () => {
    expect(
      nextSpecialtyValue(["oncology"], ["oncology", "general_medicine"]),
    ).toEqual(["oncology", "general_medicine"]);
  });
});

describe("SpecialtyField", () => {
  it("offers every specialty and Generic", async () => {
    const user = userEvent.setup();
    renderWithMantine(<SpecialtyField value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Oncology")).toBeInTheDocument();
    expect(screen.getByText("General medicine")).toBeInTheDocument();
    expect(screen.getByText("General surgery")).toBeInTheDocument();
    expect(screen.getByText(GENERIC_LABEL)).toBeInTheDocument();
  });

  it("starts with nothing chosen", () => {
    // Nothing preselected, so Generic is a choice rather than a default.
    renderWithMantine(<SpecialtyField value={null} onChange={vi.fn()} />);

    expect(
      screen.getByPlaceholderText("Choose a specialty"),
    ).toBeInTheDocument();
  });

  it("reports a chosen specialty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(<SpecialtyField value={null} onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Oncology"));

    expect(onChange).toHaveBeenCalledWith(["oncology"]);
  });

  it("reports Generic as an empty list", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(<SpecialtyField value={null} onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText(GENERIC_LABEL));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("says the choice only changes the order", () => {
    renderWithMantine(<SpecialtyField value={null} onChange={vi.fn()} />);

    expect(
      screen.getByText(/only changes the order competencies are listed in/),
    ).toBeInTheDocument();
  });

  it("shows an error when given", () => {
    renderWithMantine(
      <SpecialtyField
        value={null}
        onChange={vi.fn()}
        error="Choose a specialty, or Generic"
      />,
    );

    expect(
      screen.getByText("Choose a specialty, or Generic"),
    ).toBeInTheDocument();
  });

  it("can be disabled", () => {
    renderWithMantine(
      <SpecialtyField value={[]} onChange={vi.fn()} disabled />,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
