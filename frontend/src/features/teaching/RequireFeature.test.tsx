/**
 * Tests for useHasFeature hook and RequireFeature guard.
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

import { useHasFeature } from "@lib/features";
import { RequireFeature } from "@/auth/RequireFeature";

/** Small helper component to display hook result */
function FeatureCheck({ feature }: { feature: string }) {
  const has = useHasFeature(feature);
  return <div data-testid="result">{has ? "yes" : "no"}</div>;
}

describe("useHasFeature", () => {
  it("returns false when unauthenticated", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "unauthenticated", user: null },
    });
    renderWithRouter(<FeatureCheck feature="teaching" />);
    expect(screen.getByTestId("result").textContent).toBe("no");
  });

  it("returns false when loading", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "loading", user: null },
    });
    renderWithRouter(<FeatureCheck feature="teaching" />);
    expect(screen.getByTestId("result").textContent).toBe("no");
  });

  it("returns true when feature is in enabled_features", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "test",
          email: "test@test.com",
          enabled_features: ["teaching", "epr"],
        },
      },
    });
    renderWithRouter(<FeatureCheck feature="teaching" />);
    expect(screen.getByTestId("result").textContent).toBe("yes");
  });

  it("returns false when feature is not in enabled_features", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "test",
          email: "test@test.com",
          enabled_features: ["epr"],
        },
      },
    });
    renderWithRouter(<FeatureCheck feature="teaching" />);
    expect(screen.getByTestId("result").textContent).toBe("no");
  });

  it("returns false when enabled_features is undefined", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "test",
          email: "test@test.com",
        },
      },
    });
    renderWithRouter(<FeatureCheck feature="teaching" />);
    expect(screen.getByTestId("result").textContent).toBe("no");
  });
});

describe("RequireFeature", () => {
  it("shows children when feature is enabled", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "test",
          email: "test@test.com",
          enabled_features: ["teaching"],
        },
      },
    });
    renderWithRouter(
      <RequireFeature feature="teaching">
        <div>Protected content</div>
      </RequireFeature>,
    );
    expect(screen.getByText("Protected content")).toBeDefined();
  });

  it("shows 404 when feature is not enabled", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "test",
          email: "test@test.com",
          enabled_features: [],
        },
      },
    });
    renderWithRouter(
      <RequireFeature feature="teaching">
        <div>Protected content</div>
      </RequireFeature>,
    );
    expect(screen.queryByText("Protected content")).toBeNull();
  });

  it("shows loader when auth is loading", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "loading", user: null },
    });
    renderWithRouter(
      <RequireFeature feature="teaching">
        <div>Protected content</div>
      </RequireFeature>,
    );
    expect(screen.queryByText("Protected content")).toBeNull();
    // Mantine Loader renders a div with role
    expect(document.querySelector(".mantine-Loader-root")).toBeDefined();
  });

  it("shows 404 when unauthenticated", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "unauthenticated", user: null },
    });
    renderWithRouter(
      <RequireFeature feature="teaching">
        <div>Protected content</div>
      </RequireFeature>,
    );
    expect(screen.queryByText("Protected content")).toBeNull();
  });
});
