/**
 * GuidePage tests
 *
 * One guide, shown to somebody it is written for and a 404 to anybody
 * else.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import * as registry from "@/guides/registry";
import { api } from "@/lib/api";
import { Component as Page } from "./GuidePage";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

const SLUG = "add-a-delegate-by-hand";

function signInAs(user: Partial<User>): void {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state: {
      status: "authenticated",
      user: { id: "1", username: "someone", email: "s@example.com", ...user },
    },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

function signOut(): void {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state: { status: "unauthenticated", user: null },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

function renderGuide(slug: string) {
  return renderWithRouter(<Page />, {
    routePath: "/guides/:slug",
    initialRoute: `/guides/${slug}`,
  });
}

const teachingAdmin: Partial<User> = {
  competencies: ["manage_teaching"],
  enabled_features: ["teaching"],
};

describe("GuidePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(api.get).mockReset();
  });

  it("shows the guide under its title, once", () => {
    signInAs(teachingAdmin);

    renderGuide(SLUG);

    expect(
      screen.getAllByRole("heading", { name: "Add a delegate by hand" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Add a delegate by hand" }),
    ).toBeInTheDocument();
  });

  it("shows the guide's own words", () => {
    signInAs(teachingAdmin);

    const { container } = renderGuide(SLUG);

    expect(container.querySelector("ol li")).not.toBeNull();
  });

  it("answers a guide above the reader's tier with a 404", () => {
    signInAs({ enabled_features: ["teaching"] });

    renderGuide(SLUG);

    expect(
      screen.queryByRole("heading", { name: "Add a delegate by hand" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });

  it("answers a guide of a feature that is off with a 404", () => {
    signInAs({ competencies: ["manage_teaching"] });

    renderGuide(SLUG);

    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });

  it("answers an unknown guide with a 404", () => {
    signInAs({ ...teachingAdmin, platform_role: "superadmin" });

    renderGuide("no-such-guide");

    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });

  describe("signed out", () => {
    it("shows a public guide, with a way to sign in", () => {
      signOut();

      renderGuide("join-a-course");

      expect(
        screen.getByRole("heading", { level: 1, name: "Join a course" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Sign in to Quill" }),
      ).toHaveAttribute("href", "/login");
    });

    it("answers a guide that is not public with a 404", () => {
      signOut();

      renderGuide(SLUG);

      expect(
        screen.queryByRole("heading", { name: "Add a delegate by hand" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
    });
  });

  // The browser asks for a picture as an image, which gets none of the
  // API client's renewing of a session that has just run out. So a guide
  // whose pictures come through the API makes one call through the client
  // first. Under test the pictures are local, as in development, so these
  // say where they come from.
  describe("a guide whose pictures come through the API", () => {
    function picturesFromTheApi(): void {
      vi.spyOn(registry, "guideImageBase").mockReturnValue(
        registry.GUIDE_PRIVATE_ASSETS_PATH,
      );
    }

    it("renews the session through the client before it draws", async () => {
      let answer: (value: unknown) => void = () => undefined;
      vi.mocked(api.get).mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      signInAs(teachingAdmin);
      picturesFromTheApi();

      const { container } = renderGuide(SLUG);

      expect(api.get).toHaveBeenCalledWith("/auth/me");
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Add a delegate by hand",
        }),
      ).toBeInTheDocument();
      expect(container.querySelector("ol li")).toBeNull();

      answer({});

      await waitFor(() =>
        expect(container.querySelector("ol li")).not.toBeNull(),
      );
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it("draws the guide all the same when that call fails", async () => {
      vi.mocked(api.get).mockRejectedValue(new Error("offline"));
      signInAs(teachingAdmin);
      picturesFromTheApi();

      const { container } = renderGuide(SLUG);

      await waitFor(() =>
        expect(container.querySelector("ol li")).not.toBeNull(),
      );
    });
  });

  it("makes no call for a guide whose pictures are public", () => {
    signOut();

    const { container } = renderGuide("join-a-course");

    expect(api.get).not.toHaveBeenCalled();
    expect(container.querySelector("ol li")).not.toBeNull();
  });

  it("offers no sign-in link to somebody already signed in", () => {
    signInAs(teachingAdmin);

    renderGuide("join-a-course");

    expect(
      screen.getByRole("heading", { level: 1, name: "Join a course" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in to Quill" })).toBeNull();
  });
});
