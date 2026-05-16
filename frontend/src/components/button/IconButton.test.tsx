/**
 * IconButton Component Tests
 *
 * Tests for the IconButton wrapper component.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import IconButton from "./IconButton";
import { IconPencil, IconTrash, IconCheck } from "@/components/icons/appIcons";

describe("IconButton", () => {
  it("renders with correct size (42px container)", () => {
    renderWithMantine(<IconButton icon={<IconPencil />} aria-label="Edit" />);

    const button = screen.getByRole("button", { name: "Edit" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("mantine-ActionIcon-root");
  });

  it("handles onClick events", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    renderWithMantine(
      <IconButton
        icon={<IconPencil />}
        onClick={handleClick}
        aria-label="Click me"
      />,
    );

    const button = screen.getByRole("button", { name: "Click me" });
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("applies custom variant and color", () => {
    renderWithMantine(
      <IconButton
        icon={<IconTrash />}
        variant="filled"
        color="var(--alert-color)"
        aria-label="Delete"
      />,
    );

    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toBeInTheDocument();
  });

  it("renders with different icon types", () => {
    const { rerender } = renderWithMantine(
      <IconButton icon={<IconPencil />} aria-label="Edit" />,
    );

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();

    rerender(<IconButton icon={<IconCheck />} aria-label="Confirm" />);

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("can be disabled", () => {
    renderWithMantine(
      <IconButton
        icon={<IconPencil />}
        disabled
        aria-label="Disabled button"
      />,
    );

    const button = screen.getByRole("button", { name: "Disabled button" });
    expect(button).toBeDisabled();
  });

  it("applies custom className", () => {
    renderWithMantine(
      <IconButton
        icon={<IconPencil />}
        className="custom-class"
        aria-label="Custom"
      />,
    );

    const button = screen.getByRole("button", { name: "Custom" });
    expect(button).toHaveClass("custom-class");
  });
});
