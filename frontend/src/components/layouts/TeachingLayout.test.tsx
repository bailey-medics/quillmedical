/**
 * TeachingLayout Component Tests
 *
 * Tests for the teaching layout — clinical safety boundary that
 * excludes patient context entirely. Verifies sidebar slot,
 * drawer, footer, and responsive behaviour.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import TeachingLayout from "./TeachingLayout";
import type { User } from "@/auth/AuthContext";

vi.mock("@components/drawers/NavigationDrawer", () => ({
  default: ({
    opened,
    children,
  }: {
    opened: boolean;
    onClose: () => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="navigation-drawer" data-opened={opened}>
      {children}
    </div>
  ),
}));

vi.mock("@components/ribbon/TopRibbon", () => ({
  default: ({
    patient,
    showSearch,
  }: {
    onBurgerClick?: () => void;
    isLoading: boolean;
    patient: null;
    navOpen: boolean;
    isNarrow: boolean;
    showSearch: boolean;
  }) => (
    <div
      data-testid="top-ribbon"
      data-patient={patient}
      data-show-search={showSearch}
    />
  ),
}));

vi.mock("@components/footer/Footer", () => ({
  default: ({ text, loading }: { text?: string; loading: boolean }) => (
    <div data-testid="footer" data-loading={loading}>
      {text}
    </div>
  ),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/teaching" }),
}));

type AuthState =
  | { status: "loading"; user: null }
  | { status: "unauthenticated"; user: null }
  | { status: "authenticated"; user: User };

const mockAuthContext: {
  state: AuthState;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  refreshAuth: ReturnType<typeof vi.fn>;
} = {
  state: {
    status: "authenticated",
    user: {
      id: "1",
      username: "dr.jones",
      email: "jones@example.com",
      system_permissions: "staff",
    },
  },
  login: vi.fn(),
  logout: vi.fn(),
  refreshAuth: vi.fn(),
};

vi.mock("@/auth/AuthContext", async () => {
  const actual = await vi.importActual("@/auth/AuthContext");
  return {
    ...actual,
    useAuth: () => mockAuthContext,
  };
});

describe("TeachingLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children", () => {
    renderWithMantine(
      <TeachingLayout>
        <div>Page content</div>
      </TeachingLayout>,
    );

    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("renders TopRibbon with no patient and no search", () => {
    renderWithMantine(
      <TeachingLayout>
        <div>Content</div>
      </TeachingLayout>,
    );

    const ribbon = screen.getByTestId("top-ribbon");
    expect(ribbon).not.toHaveAttribute("data-patient");
    expect(ribbon).toHaveAttribute("data-show-search", "false");
  });

  it("renders footer with auth username by default", () => {
    renderWithMantine(
      <TeachingLayout>
        <div>Content</div>
      </TeachingLayout>,
    );

    expect(screen.getByTestId("footer")).toHaveTextContent(
      "Logged in: dr.jones",
    );
  });

  it("renders footer with override text when provided", () => {
    renderWithMantine(
      <TeachingLayout footerText="Custom footer">
        <div>Content</div>
      </TeachingLayout>,
    );

    expect(screen.getByTestId("footer")).toHaveTextContent("Custom footer");
  });

  it("renders sidebar when provided", () => {
    renderWithMantine(
      <TeachingLayout sidebar={<div data-testid="sidebar">Nav</div>}>
        <div>Content</div>
      </TeachingLayout>,
    );

    expect(screen.getAllByTestId("sidebar").length).toBeGreaterThanOrEqual(1);
  });

  it("does not render drawer when no sidebar provided", () => {
    renderWithMantine(
      <TeachingLayout>
        <div>Content</div>
      </TeachingLayout>,
    );

    expect(screen.queryByTestId("navigation-drawer")).not.toBeInTheDocument();
  });

  it("renders drawer content when sidebar is provided", () => {
    renderWithMantine(
      <TeachingLayout
        sidebar={<div data-testid="desktop-nav">Desktop nav</div>}
        drawerContent={<div data-testid="drawer-nav">Mobile nav</div>}
      >
        <div>Content</div>
      </TeachingLayout>,
    );

    const drawer = screen.getByTestId("navigation-drawer");
    expect(drawer).toBeInTheDocument();
    expect(screen.getByTestId("drawer-nav")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-nav")).toBeInTheDocument();
  });
});
