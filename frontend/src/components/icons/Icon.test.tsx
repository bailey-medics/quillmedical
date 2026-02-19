/**
 * Icon Component Tests
 *
 * Verifies Icon component renders correctly with different sizes
 * and properly clones icon elements with correct pixel sizes.
 */

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconPencil, IconUserPlus, IconSettings } from "@tabler/icons-react";
import { renderWithMantine } from "@test/test-utils";
import Icon from "./Icon";

describe("Icon Component", () => {
  it("renders with default md size (28px)", () => {
    renderWithMantine(<Icon icon={<IconPencil data-testid="pencil-icon" />} />);

    const icon = screen.getByTestId("pencil-icon");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("width", "28");
    expect(icon).toHaveAttribute("height", "28");
  });

  it("renders with sm size (20px)", () => {
    renderWithMantine(
      <Icon icon={<IconUserPlus data-testid="user-icon" />} size="sm" />,
    );

    const icon = screen.getByTestId("user-icon");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("width", "20");
    expect(icon).toHaveAttribute("height", "20");
  });

  it("renders with md size (28px)", () => {
    renderWithMantine(
      <Icon icon={<IconSettings data-testid="settings-icon" />} size="md" />,
    );

    const icon = screen.getByTestId("settings-icon");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("width", "28");
    expect(icon).toHaveAttribute("height", "28");
  });

  it("renders with lg size (48px)", () => {
    renderWithMantine(
      <Icon icon={<IconPencil data-testid="large-icon" />} size="lg" />,
    );

    const icon = screen.getByTestId("large-icon");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("width", "48");
    expect(icon).toHaveAttribute("height", "48");
  });

  it("applies custom className", () => {
    renderWithMantine(
      <Icon
        icon={<IconPencil data-testid="custom-icon" />}
        size="md"
        className="custom-class"
      />,
    );

    const icon = screen.getByTestId("custom-icon");
    expect(icon).toHaveClass("custom-class");
  });

  it("renders different icon types correctly", () => {
    const { rerender } = renderWithMantine(
      <Icon icon={<IconPencil data-testid="icon" />} size="sm" />,
    );

    let icon = screen.getByTestId("icon");
    expect(icon).toHaveAttribute("width", "20");

    rerender(<Icon icon={<IconUserPlus data-testid="icon" />} size="md" />);

    icon = screen.getByTestId("icon");
    expect(icon).toHaveAttribute("width", "28");

    rerender(<Icon icon={<IconSettings data-testid="icon" />} size="lg" />);

    icon = screen.getByTestId("icon");
    expect(icon).toHaveAttribute("width", "48");
  });
});
