import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import EmailField from "./EmailField";
import { EMAIL_PATTERN } from "./emailPattern";

describe("EmailField", () => {
  it("renders with a label", () => {
    renderWithMantine(<EmailField label="Email address" />);
    expect(screen.getByText("Email address")).toBeInTheDocument();
  });

  it("renders with placeholder text", () => {
    renderWithMantine(
      <EmailField label="Email" placeholder="name@example.com" />,
    );
    expect(screen.getByPlaceholderText("name@example.com")).toBeInTheDocument();
  });

  it("sets type to email", () => {
    renderWithMantine(<EmailField label="Email" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "email");
  });

  it("sets autoComplete to email", () => {
    renderWithMantine(<EmailField label="Email" />);
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "autocomplete",
      "email",
    );
  });

  it("accepts user input", async () => {
    const user = userEvent.setup();
    renderWithMantine(<EmailField label="Email" />);

    const input = screen.getByRole("textbox");
    await user.type(input, "test@example.com");
    expect(input).toHaveValue("test@example.com");
  });

  it("applies standardised label styles", () => {
    renderWithMantine(<EmailField label="Email" />);

    const label = screen.getByText("Email");
    expect(label).toHaveStyle({
      fontSize: "var(--mantine-font-size-md)",
      color: "var(--mantine-color-text)",
      marginBottom: "0.25rem",
    });
  });

  it("applies standardised input font size", () => {
    renderWithMantine(<EmailField label="Email" placeholder="Type here" />);

    const input = screen.getByRole("textbox");
    expect(input).toHaveStyle({
      fontSize: "var(--mantine-font-size-md)",
    });
  });

  it("renders as disabled when disabled prop is set", () => {
    renderWithMantine(<EmailField label="Email" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("renders description text", () => {
    renderWithMantine(
      <EmailField label="Email" description="We will email you a link" />,
    );
    expect(screen.getByText("We will email you a link")).toBeInTheDocument();
  });

  it("renders error message", () => {
    renderWithMantine(
      <EmailField label="Email" error="Please enter a valid email address" />,
    );
    expect(
      screen.getByText("Please enter a valid email address"),
    ).toBeInTheDocument();
  });
});

describe("EMAIL_PATTERN", () => {
  const { value: pattern } = EMAIL_PATTERN;

  it.each([
    "user@example.com",
    "user.name@example.co.uk",
    "user+tag@example.com",
    "a@b.c",
  ])("matches valid email: %s", (email) => {
    expect(pattern.test(email)).toBe(true);
  });

  it.each(["", "user", "user@", "@example.com", "user @example.com"])(
    "rejects invalid email: %s",
    (email) => {
      expect(pattern.test(email)).toBe(false);
    },
  );

  it("has a user-friendly error message", () => {
    expect(EMAIL_PATTERN.message).toBe("Please enter a valid email address");
  });
});
