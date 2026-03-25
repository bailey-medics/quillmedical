import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import TextAreaField from "./TextAreaField";

describe("TextAreaField", () => {
  it("renders with a label", () => {
    renderWithMantine(<TextAreaField label="Message" />);
    expect(screen.getByText("Message")).toBeInTheDocument();
  });

  it("renders with placeholder text", () => {
    renderWithMantine(
      <TextAreaField label="Message" placeholder="Type your message…" />,
    );
    expect(
      screen.getByPlaceholderText("Type your message…"),
    ).toBeInTheDocument();
  });

  it("accepts user input", async () => {
    const user = userEvent.setup();
    renderWithMantine(<TextAreaField label="Message" />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello there");
    expect(textarea).toHaveValue("Hello there");
  });

  it("applies standardised label styles", () => {
    renderWithMantine(<TextAreaField label="Message" />);

    const label = screen.getByText("Message");
    expect(label).toHaveStyle({
      fontSize: "var(--mantine-font-size-lg)",
      color: "var(--mantine-color-black)",
    });
  });

  it("applies standardised input font size", () => {
    renderWithMantine(
      <TextAreaField label="Message" placeholder="Type here" />,
    );

    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveStyle({
      fontSize: "var(--mantine-font-size-lg)",
    });
  });

  it("renders as disabled when disabled prop is set", () => {
    renderWithMantine(<TextAreaField label="Message" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
