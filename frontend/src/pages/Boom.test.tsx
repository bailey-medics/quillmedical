import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import ErrorBoundary from "@/components/error-boundary/ErrorBoundary";
import { resetReportingStateForTests } from "@lib/error-reporting/report";
import Boom from "./Boom";

describe("Boom", () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetReportingStateForTests();
    beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon: beacon, userAgent: "test" });
  });

  it("crashes into the fallback and reports a component stack", async () => {
    // What the live check is meant to confirm, asserted here too: the crash
    // reaches the boundary rather than the router's error element, and the
    // report carries the component stack only a boundary can supply.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithMantine(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    const blob = beacon.mock.calls[0]?.[1] as Blob;
    const body = JSON.parse(await blob.text()) as Record<string, unknown>;
    expect(body["source"]).toBe("boundary");
    expect(String(body["component_stack"])).toContain("Boom");

    consoleSpy.mockRestore();
  });
});
