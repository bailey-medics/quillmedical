import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SelectField from "./SelectField";

const options = [
  { value: "1", label: "James Green" },
  { value: "2", label: "Sarah Mitchell" },
];

describe("SelectField", () => {
  it("renders with a label", () => {
    renderWithMantine(<SelectField label="Patient" data={options} />);
    expect(screen.getByText("Patient")).toBeInTheDocument();
  });

  it("renders with placeholder text", () => {
    renderWithMantine(
      <SelectField
        label="Patient"
        placeholder="Select a patient"
        data={options}
      />,
    );
    expect(screen.getByPlaceholderText("Select a patient")).toBeInTheDocument();
  });

  it("opens dropdown on click", async () => {
    const user = userEvent.setup();
    renderWithMantine(<SelectField label="Patient" data={options} />);

    await user.click(screen.getByRole("textbox"));
    expect(screen.getByText("James Green")).toBeInTheDocument();
    expect(screen.getByText("Sarah Mitchell")).toBeInTheDocument();
  });

  it("applies standardised label styles", () => {
    renderWithMantine(<SelectField label="Patient" data={options} />);

    const label = screen.getByText("Patient");
    expect(label).toHaveStyle({
      fontSize: "var(--mantine-font-size-lg)",
      color: "var(--mantine-color-black)",
      marginBottom: "0.25rem",
    });
  });

  it("applies standardised input font size", () => {
    renderWithMantine(
      <SelectField label="Patient" placeholder="Select" data={options} />,
    );

    const input = screen.getByRole("textbox");
    expect(input).toHaveStyle({
      fontSize: "var(--mantine-font-size-lg)",
    });
  });

  it("renders as disabled when disabled prop is set", () => {
    renderWithMantine(<SelectField label="Patient" data={options} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
