import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { resetReportingStateForTests } from "@lib/error-reporting/report";
import ErrorBoundary, { ErrorFallback } from "./ErrorBoundary";

/** Renders a component that throws, with React's own console noise silenced. */
function renderThrowing(message: string): () => void {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  function ThrowingComponent(): never {
    throw new Error(message);
  }

  renderWithMantine(
    <ErrorBoundary>
      <ThrowingComponent />
    </ErrorBoundary>,
  );

  return () => consoleSpy.mockRestore();
}

describe("ErrorBoundary", () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetReportingStateForTests();
    beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon: beacon, userAgent: "test" });
  });

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

  describe("reporting a caught error", () => {
    it("sends a report as well as logging to the console", async () => {
      const restore = renderThrowing("Test error");

      expect(beacon).toHaveBeenCalledTimes(1);
      restore();
    });

    it("marks the report as coming from a boundary", async () => {
      const restore = renderThrowing("Test error");

      const blob = beacon.mock.calls[0]?.[1] as Blob;
      const body = JSON.parse(await blob.text()) as Record<string, unknown>;
      expect(body["source"]).toBe("boundary");
      restore();
    });

    it("includes the component stack, which only a boundary has", async () => {
      // The JavaScript frames say where in the bundle; the component stack
      // says which part of the interface, and nothing else can supply it.
      const restore = renderThrowing("Test error");

      const blob = beacon.mock.calls[0]?.[1] as Blob;
      const body = JSON.parse(await blob.text()) as Record<string, unknown>;
      expect(String(body["component_stack"])).toContain("ThrowingComponent");
      restore();
    });

    it("still shows the fallback when reporting cannot send", () => {
      // The user is already looking at a broken page; a failure to report it
      // must not be allowed to make that worse.
      vi.stubGlobal("navigator", {
        sendBeacon: () => {
          throw new Error("beacon exploded");
        },
        userAgent: "test",
      });

      const restore = renderThrowing("Test error");

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      restore();
    });

    it("does not report when nothing throws", () => {
      renderWithMantine(
        <ErrorBoundary>
          <div>Normal content</div>
        </ErrorBoundary>,
      );

      expect(beacon).not.toHaveBeenCalled();
    });
  });
});
