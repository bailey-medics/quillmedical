/**
 * A teaching delegate is shown the 404 page for every admin page.
 *
 * Walks the `/admin` routes in `routes.tsx`, so a new admin page is
 * checked without anybody adding it here, and renders each as a teaching
 * delegate holding what their base profession gives them. The API behind
 * the pages is checked on its own, route by route, in
 * `backend/tests/a_delegate_reaches_only_their_own_test.py`.
 *
 * Phase 12 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 */

import { screen } from "@testing-library/react";
import type { RouteObject } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import professions from "@/generated/base-professions.json";
import { routes } from "@/routes";
import { renderRoutes } from "@/test/test-utils";

const NOT_FOUND = "404 - Page not found";

/** The route at *path*, wherever it sits in *list*. */
function find(list: RouteObject[], path: string): RouteObject | undefined {
  for (const route of list) {
    if (route.path === path) {
      return route;
    }

    const found = find(route.children ?? [], path);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

/** The `/admin` route, wherever it sits in the tree. */
function adminRoute(): RouteObject {
  const found = find(routes, "/admin");

  if (found === undefined) {
    throw new Error("No /admin route in routes.tsx");
  }

  return found;
}

/** Every address under *route*, with each parameter given a value. */
function addresses(route: RouteObject, prefix: string): string[] {
  const here =
    route.path === undefined
      ? prefix
      : route.path.startsWith("/")
        ? route.path
        : `${prefix}/${route.path}`;
  const own = route.index || route.children === undefined ? [here] : [];

  return [
    ...own,
    ...(route.children ?? []).flatMap((child) => addresses(child, here)),
  ].map((address) => address.replace(/:\w+/g, "1"));
}

/** Somebody holding exactly what a base profession gives. */
function personOf(profession: string): User {
  const found = professions.base_professions.find(
    (candidate) => candidate.id === profession,
  );

  if (found === undefined) {
    throw new Error(`No base profession ${profession}`);
  }

  return {
    id: "7",
    username: profession,
    email: `${profession}@example.com`,
    platform_role: "standard",
    competencies: found.base_competencies,
  };
}

/** Signed in as *user*. */
function signedInAs(user: User): void {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state: { status: "authenticated", user },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

const ADMIN_PAGES = [...new Set(addresses(adminRoute(), ""))];

describe("the admin pages, to a teaching delegate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("walks every admin page there is", () => {
    // A walk that found nothing would pass every case below.
    expect(ADMIN_PAGES.length).toBeGreaterThan(30);
    expect(ADMIN_PAGES).toContain("/admin");
    expect(ADMIN_PAGES).toContain("/admin/teaching/all-delegates");
  });

  it("holds none of what opens the admin area", () => {
    expect(personOf("teaching_delegate").competencies).not.toContain(
      "manage_users",
    );
  });

  // Found, not got: a data router renders once the matched route's
  // lazy page has loaded, guard and all.
  it.each(ADMIN_PAGES)("shows %s as the 404 page", async (address) => {
    signedInAs(personOf("teaching_delegate"));

    renderRoutes([adminRoute()], address);

    expect(
      await screen.findByText(NOT_FOUND, {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
  });

  it("lets a teaching admin past the same guard", async () => {
    // So the 404 above is the guard turning a delegate away, and not
    // every page failing to render in a test.
    signedInAs(personOf("teaching_admin"));

    renderRoutes([adminRoute()], "/admin");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Administration" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(NOT_FOUND)).not.toBeInTheDocument();
  });
});
