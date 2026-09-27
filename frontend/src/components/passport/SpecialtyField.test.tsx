/**
 * SpecialtyField Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { PASSPORT_SPECIALTIES } from "@lib/passport/specialties";
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

/** The alphabetical default, as the bundle holds it. */
const OPTIONS = PASSPORT_SPECIALTIES;

/** What the options read, top to bottom, once the dropdown is open. */
function optionLabels(): string[] {
  return screen.getAllByRole("option").map((o) => o.textContent ?? "");
}

describe("SpecialtyField", () => {
  it("offers every specialty and Generic", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <SpecialtyField options={OPTIONS} value={null} onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole("combobox"));

    await screen.findByText("Oncology");
    expect(optionLabels()).toEqual([
      "General medicine",
      "General surgery",
      "Oncology",
      GENERIC_LABEL,
    ]);
  });

  it("offers the specialties in the order it is given, Generic last", async () => {
    // An oncology department's lead specialty, as the backend orders it
    const user = userEvent.setup();
    renderWithMantine(
      <SpecialtyField
        options={[
          { id: "oncology", display_name: "Oncology" },
          { id: "general_medicine", display_name: "General medicine" },
          { id: "general_surgery", display_name: "General surgery" },
        ]}
        value={null}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await screen.findByText("Oncology");

    expect(optionLabels()).toEqual([
      "Oncology",
      "General medicine",
      "General surgery",
      GENERIC_LABEL,
    ]);
  });

  it("starts with nothing chosen", () => {
    // Nothing preselected, so Generic is a choice rather than a default.
    renderWithMantine(
      <SpecialtyField options={OPTIONS} value={null} onChange={vi.fn()} />,
    );

    expect(
      screen.getByPlaceholderText("Choose a specialty"),
    ).toBeInTheDocument();
  });

  it("reports a chosen specialty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(
      <SpecialtyField options={OPTIONS} value={null} onChange={onChange} />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Oncology"));

    expect(onChange).toHaveBeenCalledWith(["oncology"]);
  });

  it("reports Generic as an empty list", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(
      <SpecialtyField options={OPTIONS} value={null} onChange={onChange} />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText(GENERIC_LABEL));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows no helper text unless given one", () => {
    renderWithMantine(
      <SpecialtyField options={OPTIONS} value={null} onChange={vi.fn()} />,
    );

    expect(
      document.querySelector(".mantine-InputWrapper-description"),
    ).toBeNull();
  });

  it("shows the helper text it is given", () => {
    renderWithMantine(
      <SpecialtyField
        options={OPTIONS}
        value={null}
        onChange={vi.fn()}
        description="Choose the one you work in"
      />,
    );

    expect(screen.getByText("Choose the one you work in")).toBeInTheDocument();
  });

  it("shows an error when given", () => {
    renderWithMantine(
      <SpecialtyField
        options={OPTIONS}
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
      <SpecialtyField
        options={OPTIONS}
        value={[]}
        onChange={vi.fn()}
        disabled
      />,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
