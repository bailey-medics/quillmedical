import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import PasswordField from "./PasswordField";

describe("PasswordField", () => {
  it("renders with a label", () => {
    renderWithMantine(<PasswordField label="Password" />);
    expect(screen.getByText("Password")).toBeInTheDocument();
  });

  it("renders with placeholder text", () => {
    renderWithMantine(
      <PasswordField label="Password" placeholder="Enter password" />,
    );
    expect(screen.getByPlaceholderText("Enter password")).toBeInTheDocument();
  });

  it("accepts user input", async () => {
    const user = userEvent.setup();
    renderWithMantine(<PasswordField label="Password" />);

    const input = screen.getByLabelText("Password");
    await user.type(input, "secret123");
    expect(input).toHaveValue("secret123");
  });

  it("applies standardised label styles", () => {
    renderWithMantine(<PasswordField label="Password" />);

    const label = screen.getByText("Password");
    expect(label).toHaveStyle({
      fontSize: "var(--mantine-font-size-lg)",
      color: "var(--mantine-color-text)",
      marginBottom: "0.25rem",
    });
  });

  it("renders as disabled when disabled prop is set", () => {
    renderWithMantine(<PasswordField label="Password" disabled />);
    expect(screen.getByLabelText("Password")).toBeDisabled();
  });
});
