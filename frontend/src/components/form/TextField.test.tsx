import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import TextField from "./TextField";

describe("TextField", () => {
  it("renders with a label", () => {
    renderWithMantine(<TextField label="Subject" />);
    expect(screen.getByText("Subject")).toBeInTheDocument();
  });

  it("renders with placeholder text", () => {
    renderWithMantine(<TextField label="Name" placeholder="Enter your name" />);
    expect(screen.getByPlaceholderText("Enter your name")).toBeInTheDocument();
  });

  it("accepts user input", async () => {
    const user = userEvent.setup();
    renderWithMantine(<TextField label="Subject" />);

    const input = screen.getByRole("textbox");
    await user.type(input, "Hello");
    expect(input).toHaveValue("Hello");
  });

  it("applies standardised label styles", () => {
    renderWithMantine(<TextField label="Subject" />);

    const label = screen.getByText("Subject");
    expect(label).toHaveStyle({
      fontSize: "var(--mantine-font-size-lg)",
      color: "var(--mantine-color-dimmed)",
      fontWeight: 400,
    });
  });

  it("applies standardised input font size", () => {
    renderWithMantine(<TextField label="Subject" placeholder="Type here" />);

    const input = screen.getByRole("textbox");
    expect(input).toHaveStyle({
      fontSize: "var(--mantine-font-size-lg)",
    });
  });

  it("renders as disabled when disabled prop is set", () => {
    renderWithMantine(<TextField label="Subject" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
