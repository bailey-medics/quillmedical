import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import MultiSelectField from "./MultiSelectField";

const options = [
  { value: "1", label: "Dr Corbett" },
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

    await user.click(screen.getByRole("textbox"));
    expect(screen.getByText("Dr Corbett")).toBeInTheDocument();
    expect(screen.getByText("Nurse Adams")).toBeInTheDocument();
  });

  it("applies standardised label styles", () => {
    renderWithMantine(<MultiSelectField label="Participants" data={options} />);

    const label = screen.getByText("Participants");
    expect(label).toHaveStyle({
      fontSize: "var(--mantine-font-size-lg)",
      color: "var(--mantine-color-black)",
    });
  });

  it("renders as disabled when disabled prop is set", () => {
    renderWithMantine(
      <MultiSelectField label="Participants" data={options} disabled />,
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
