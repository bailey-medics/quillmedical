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

  it("renders with xl size (72px)", () => {
    renderWithMantine(
      <Icon icon={<IconPencil data-testid="xl-icon" />} size="xl" />,
    );

    const icon = screen.getByTestId("xl-icon");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("width", "72");
    expect(icon).toHaveAttribute("height", "72");
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

  it("applies colour when provided", () => {
    renderWithMantine(
      <Icon icon={<IconPencil data-testid="coloured-icon" />} colour="red" />,
    );

    const icon = screen.getByTestId("coloured-icon");
    expect(icon).toHaveAttribute("stroke", "red");
  });

  it("does not override stroke when colour is not provided", () => {
    renderWithMantine(
      <Icon icon={<IconPencil data-testid="no-colour-icon" />} />,
    );

    const icon = screen.getByTestId("no-colour-icon");
    expect(icon).toHaveAttribute("stroke", "currentColor");
  });

  it("wraps icon in ThemeIcon when container is set", () => {
    const { container } = renderWithMantine(
      <Icon
        icon={<IconPencil data-testid="contained-icon" />}
        container="green"
      />,
    );

    const icon = screen.getByTestId("contained-icon");
    expect(icon).toBeInTheDocument();
    // ThemeIcon renders a div wrapper around the icon
    const themeIcon = container.querySelector(".mantine-ThemeIcon-root");
    expect(themeIcon).toBeInTheDocument();
  });

  it("does not wrap in ThemeIcon when container is not set", () => {
    const { container } = renderWithMantine(
      <Icon icon={<IconPencil data-testid="no-container-icon" />} />,
    );

    expect(screen.getByTestId("no-container-icon")).toBeInTheDocument();
    const themeIcon = container.querySelector(".mantine-ThemeIcon-root");
    expect(themeIcon).not.toBeInTheDocument();
  });
});
