import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, remToPx } from "@test/test-utils";
import MultiSelectField from "./MultiSelectField";
import dropdownClasses from "./dropdownGroupLabel.module.css";

const options = [
  { value: "1", label: "Dr Fenwick" },
  { value: "2", label: "Nurse Adams" },
];

describe("MultiSelectField", () => {
  it("renders with a label", () => {
    renderWithMantine(<MultiSelectField label="Participants" data={options} />);
    expect(screen.getByText("Participants")).toBeInTheDocument();
  });

  it("renders with placeholder text", () => {
    renderWithMantine(
      <MultiSelectField
        label="Participants"
        placeholder="Add staff"
        data={options}
      />,
    );
    expect(screen.getByPlaceholderText("Add staff")).toBeInTheDocument();
  });

  it("opens dropdown on click", async () => {
    const user = userEvent.setup();
    renderWithMantine(<MultiSelectField label="Participants" data={options} />);

    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("Dr Fenwick")).toBeInTheDocument();
    expect(screen.getByText("Nurse Adams")).toBeInTheDocument();
  });

  it("applies standardised label styles", () => {
    renderWithMantine(<MultiSelectField label="Participants" data={options} />);

    const label = screen.getByText("Participants");
    expect(label).toHaveStyle({
      marginBottom: remToPx("0.25rem"),
    });
    expect(label.style.fontSize).toBe("var(--mantine-font-size-md)");
    expect(label.style.color).toBe("var(--mantine-color-text)");
  });

  it("renders as disabled when disabled prop is set", () => {
    renderWithMantine(
      <MultiSelectField label="Participants" data={options} disabled />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("draws each group heading as a divider, not an option", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <MultiSelectField
        label="Competencies"
        data={[
          {
            group: "Oncology",
            items: [
              { value: "prescribe_sact", label: "Prescribe SACT" },
              { value: "assess_sact_toxicity", label: "Assess SACT toxicity" },
            ],
          },
          {
            group: "Others",
            items: [
              {
                value: "take_informed_consent",
                label: "Take informed consent",
              },
              { value: "request_plain_xray", label: "Request plain X-rays" },
            ],
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("combobox"));

    const heading = await screen.findByText("Oncology");
    expect(heading).toHaveClass(dropdownClasses.groupLabel);
    expect(
      screen.queryByRole("option", { name: "Oncology" }),
    ).not.toBeInTheDocument();
  });
  describe("Read-only", () => {
    // Mantine shows no options when read-only, but still marks the list
    // as open on a click, so a screen reader announces an empty list.
    it("stays announced as closed when clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MultiSelectField label="Participants" data={options} readOnly />,
      );
      const field = screen.getByRole("combobox", { name: "Participants" });

      await user.click(field);

      expect(field).not.toHaveAttribute("aria-expanded", "true");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("says it is read-only", () => {
      renderWithMantine(
        <MultiSelectField label="Participants" data={options} readOnly />,
      );

      expect(
        screen.getByRole("combobox", { name: "Participants" }),
      ).toHaveAttribute("aria-readonly", "true");
    });
  });
});
