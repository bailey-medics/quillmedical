import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import ErrorBoundary, { ErrorFallback } from "./ErrorBoundary";

describe("ErrorBoundary", () => {
  describe("ErrorFallback", () => {
    it("renders heading", () => {
      renderWithMantine(<ErrorFallback onReload={() => {}} />);
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    it("renders explanation text", () => {
      renderWithMantine(<ErrorFallback onReload={() => {}} />);
      expect(
        screen.getByText(
          "An unexpected error occurred. Please try reloading the page.",
        ),
      ).toBeInTheDocument();
    });

    it("renders reload button", () => {
      renderWithMantine(<ErrorFallback onReload={() => {}} />);
      expect(
        screen.getByRole("button", { name: /reload page/i }),
      ).toBeInTheDocument();
    });

    it("calls onReload when button is clicked", async () => {
      const user = userEvent.setup();
      const onReload = vi.fn();
      renderWithMantine(<ErrorFallback onReload={onReload} />);

      await user.click(screen.getByRole("button", { name: /reload page/i }));
      expect(onReload).toHaveBeenCalledOnce();
    });

    it("renders with data-testid for querying", () => {
      const { container } = renderWithMantine(
        <ErrorFallback onReload={() => {}} />,
      );
      expect(
        container.querySelector('[data-testid="error-boundary-fallback"]'),
      ).toBeInTheDocument();
    });
  });

  describe("ErrorBoundary wrapper", () => {
    it("renders children when no error occurs", () => {
      renderWithMantine(
        <ErrorBoundary>
          <div>Normal content</div>
        </ErrorBoundary>,
      );
      expect(screen.getByText("Normal content")).toBeInTheDocument();
    });

    it("renders fallback when child throws", () => {
      // Suppress React error boundary console output during test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      function ThrowingComponent(): never {
        throw new Error("Test error");
      }

      renderWithMantine(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>,
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(screen.queryByText("Normal content")).not.toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });
});
