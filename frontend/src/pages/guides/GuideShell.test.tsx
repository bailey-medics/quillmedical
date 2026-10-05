/**
 * GuideShell tests
 *
 * What goes round one guide: the app for somebody signed in, a plain page
 * for anybody else.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { renderWithMantine } from "@/test/test-utils";
import * as authContext from "@/auth/AuthContext";
import GuideShell from "./GuideShell";

vi.mock("@/RootLayout", () => ({
  default: () => <div>The whole app</div>,
}));

type Status = "loading" | "authenticated" | "unauthenticated";

function renderShell(status: Status) {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state:
      status === "authenticated"
        ? {
            status,
            user: { id: "1", username: "someone", email: "s@example.com" },
          }
        : { status, user: null },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
  const router = createMemoryRouter(
    [
      {
        path: "/guides/:slug",
        element: <GuideShell />,
        children: [{ index: true, element: <div>The guide</div> }],
      },
    ],
    { initialEntries: ["/guides/join-a-course"] },
  );
  return renderWithMantine(<RouterProvider router={router} />);
}

describe("GuideShell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("puts the app round the guide for somebody signed in", () => {
    renderShell("authenticated");

    expect(screen.getByText("The whole app")).toBeInTheDocument();
  });

  it("shows the guide by itself, as the main content, signed out", () => {
    renderShell("unauthenticated");

    expect(screen.getByRole("main")).toHaveTextContent("The guide");
    expect(screen.queryByText("The whole app")).not.toBeInTheDocument();
  });

  it("does not send somebody signed out to the login page", () => {
    renderShell("unauthenticated");

    expect(screen.queryByText("The guide")).toBeInTheDocument();
  });

  it("shows neither while the session is being checked", () => {
    renderShell("loading");

    expect(screen.queryByText("The guide")).not.toBeInTheDocument();
    expect(screen.queryByText("The whole app")).not.toBeInTheDocument();
  });
});
