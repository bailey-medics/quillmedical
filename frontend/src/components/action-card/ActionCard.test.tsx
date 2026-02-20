/**
 * ActionCard Component Tests
 *
 * Tests for the reusable action card component with icon, title,
 * description, and call-to-action button.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, renderWithRouter } from "@/test/test-utils";
import ActionCard from "./ActionCard";
import { IconUserPlus, IconSettings } from "@tabler/icons-react";

describe("ActionCard", () => {
  const defaultProps = {
    icon: <IconUserPlus data-testid="test-icon" />,
    title: "Test Action",
    subtitle: "This is a test action card",
    buttonLabel: "Click Me",
    buttonUrl: "/test",
  };

  describe("Basic rendering", () => {
    it("renders title", () => {
      renderWithRouter(<ActionCard {...defaultProps} />);
      expect(screen.getByText("Test Action")).toBeInTheDocument();
    });

    it("renders subtitle", () => {
      renderWithRouter(<ActionCard {...defaultProps} />);
      expect(
        screen.getByText("This is a test action card"),
      ).toBeInTheDocument();
    });

    it("renders button with label", () => {
      renderWithRouter(<ActionCard {...defaultProps} />);
      expect(
        screen.getByRole("link", { name: /Click Me/i }),
      ).toBeInTheDocument();
    });

    it("renders icon", () => {
      renderWithRouter(<ActionCard {...defaultProps} />);
      expect(screen.getByTestId("test-icon")).toBeInTheDocument();
    });
  });

  describe("Navigation behavior", () => {
    it("renders link with correct URL", () => {
      renderWithRouter(<ActionCard {...defaultProps} />);
      const link = screen.getByRole("link", { name: /Click Me/i });
      expect(link).toHaveAttribute("href", "/test");
    });

    it("renders link with different URL", () => {
      renderWithRouter(
        <ActionCard {...defaultProps} buttonUrl="/another-page" />,
      );
      const link = screen.getByRole("link", { name: /Click Me/i });
      expect(link).toHaveAttribute("href", "/another-page");
    });
  });

  describe("onClick behavior", () => {
    it("calls onClick when provided", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      renderWithMantine(<ActionCard {...defaultProps} onClick={onClick} />);

      const button = screen.getByRole("button", { name: /Click Me/i });
      await user.click(button);

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("renders button instead of link when onClick provided", () => {
      const onClick = vi.fn();
      renderWithMantine(<ActionCard {...defaultProps} onClick={onClick} />);

      expect(
        screen.getByRole("button", { name: /Click Me/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /Click Me/i }),
      ).not.toBeInTheDocument();
    });

    it("onClick takes precedence over buttonUrl", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      renderWithMantine(
        <ActionCard {...defaultProps} buttonUrl="/test" onClick={onClick} />,
      );

      const button = screen.getByRole("button", { name: /Click Me/i });
      await user.click(button);

      expect(onClick).toHaveBeenCalled();
      expect(
        screen.queryByRole("link", { name: /Click Me/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Different icons", () => {
    it("renders with different icon", () => {
      renderWithRouter(
        <ActionCard
          {...defaultProps}
          icon={<IconSettings data-testid="settings-icon" />}
        />,
      );
      expect(screen.getByTestId("settings-icon")).toBeInTheDocument();
    });
  });

  describe("Content variations", () => {
    it("renders with long title", () => {
      const longTitle =
        "This is a very long action title that spans multiple words";
      renderWithRouter(<ActionCard {...defaultProps} title={longTitle} />);
      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it("renders with long subtitle", () => {
      const longSubtitle =
        "This is a very long description that provides detailed information about what this action card does and why you might want to use it";
      renderWithRouter(
        <ActionCard {...defaultProps} subtitle={longSubtitle} />,
      );
      expect(screen.getByText(longSubtitle)).toBeInTheDocument();
    });

    it("renders with long button label", () => {
      renderWithRouter(
        <ActionCard
          {...defaultProps}
          buttonLabel="Click Here to Perform Action"
        />,
      );
      expect(
        screen.getByRole("link", { name: /Click Here to Perform Action/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Mantine components", () => {
    it("renders as a Card component", () => {
      const { container } = renderWithRouter(<ActionCard {...defaultProps} />);
      const card = container.querySelector(".mantine-Card-root");
      expect(card).toBeInTheDocument();
    });

    it("renders button with light variant", () => {
      const { container } = renderWithRouter(<ActionCard {...defaultProps} />);
      const button = container.querySelector('[data-variant="light"]');
      expect(button).toBeInTheDocument();
    });

    it("renders button with fullWidth", () => {
      const { container } = renderWithRouter(<ActionCard {...defaultProps} />);
      const button = container.querySelector('[data-block="true"]');
      expect(button).toBeInTheDocument();
    });

    it("renders subtitle with dimmed color", () => {
      renderWithRouter(<ActionCard {...defaultProps} />);
      const subtitle = screen.getByText("This is a test action card");
      expect(subtitle).toHaveStyle({ color: "var(--mantine-color-dimmed)" });
    });
  });

  describe("Accessibility", () => {
    it("has heading for title", () => {
      renderWithRouter(<ActionCard {...defaultProps} />);
      expect(
        screen.getByRole("heading", { name: /Test Action/i }),
      ).toBeInTheDocument();
    });

    it("button/link has accessible name", () => {
      renderWithRouter(<ActionCard {...defaultProps} />);
      const link = screen.getByRole("link", { name: /Click Me/i });
      expect(link).toHaveAccessibleName("Click Me");
    });
  });
});
