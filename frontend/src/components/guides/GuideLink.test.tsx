/**
 * GuideLink tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import GuideLink from "./GuideLink";

function signInAs(user: Partial<User> | null): void {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state: user
      ? {
          status: "authenticated",
          user: {
            id: "1",
            username: "someone",
            email: "s@example.com",
            ...user,
          },
        }
      : { status: "unauthenticated", user: null },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

const LINK = { name: "Guide: Add a delegate by hand" };

describe("GuideLink", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("links to the guide, named by its title", () => {
    signInAs({
      competencies: ["manage_teaching"],
      enabled_features: ["teaching"],
    });

    renderWithRouter(<GuideLink slug="add-a-delegate-by-hand" />);

    expect(screen.getByRole("link", LINK)).toHaveAttribute(
      "href",
      "/guides/add-a-delegate-by-hand",
    );
  });

  it("shows the link to a reader the guide is written for", () => {
    signInAs({
      competencies: ["manage_teaching"],
      enabled_features: ["teaching"],
    });

    renderWithRouter(<GuideLink slug="add-a-delegate-by-hand" />);

    expect(screen.getByRole("link", LINK)).toBeInTheDocument();
  });

  it("shows nothing to a reader below the guide's audience", () => {
    signInAs({ enabled_features: ["teaching"] });

    const { container } = renderWithRouter(
      <GuideLink slug="add-a-delegate-by-hand" />,
    );

    expect(screen.queryByRole("link", LINK)).not.toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();
  });

  it("shows nothing where the guide's feature is off", () => {
    signInAs({ competencies: ["manage_users"] });

    renderWithRouter(<GuideLink slug="add-a-delegate-by-hand" />);

    expect(screen.queryByRole("link", LINK)).not.toBeInTheDocument();
  });

  it("shows nothing to somebody who is not signed in", () => {
    signInAs(null);

    renderWithRouter(<GuideLink slug="add-a-delegate-by-hand" />);

    expect(screen.queryByRole("link", LINK)).not.toBeInTheDocument();
  });
});
