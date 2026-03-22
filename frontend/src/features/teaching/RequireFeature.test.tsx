/**
 * Tests for useHasFeature hook and RequireFeature guard.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { theme } from "@/theme";

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

import { useHasFeature } from "@lib/features";
import { RequireFeature } from "@/auth/RequireFeature";

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <MantineProvider theme={theme} env="test">
        {children}
      </MantineProvider>
    </MemoryRouter>
  );
}

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
    render(<FeatureCheck feature="teaching" />, { wrapper: Wrapper });
    expect(screen.getByTestId("result").textContent).toBe("no");
  });

  it("returns false when loading", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "loading", user: null },
    });
    render(<FeatureCheck feature="teaching" />, { wrapper: Wrapper });
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
    render(<FeatureCheck feature="teaching" />, { wrapper: Wrapper });
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
    render(<FeatureCheck feature="teaching" />, { wrapper: Wrapper });
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
    render(<FeatureCheck feature="teaching" />, { wrapper: Wrapper });
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
    render(
      <RequireFeature feature="teaching">
        <div>Protected content</div>
      </RequireFeature>,
      { wrapper: Wrapper },
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
    render(
      <RequireFeature feature="teaching">
        <div>Protected content</div>
      </RequireFeature>,
      { wrapper: Wrapper },
    );
    expect(screen.queryByText("Protected content")).toBeNull();
  });

  it("shows loader when auth is loading", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "loading", user: null },
    });
    render(
      <RequireFeature feature="teaching">
        <div>Protected content</div>
      </RequireFeature>,
      { wrapper: Wrapper },
    );
    expect(screen.queryByText("Protected content")).toBeNull();
    // Mantine Loader renders a div with role
    expect(document.querySelector(".mantine-Loader-root")).toBeDefined();
  });

  it("shows 404 when unauthenticated", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "unauthenticated", user: null },
    });
    render(
      <RequireFeature feature="teaching">
        <div>Protected content</div>
      </RequireFeature>,
      { wrapper: Wrapper },
    );
    expect(screen.queryByText("Protected content")).toBeNull();
  });
});
