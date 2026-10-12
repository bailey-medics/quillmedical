/**
 * Route list tests
 *
 * Two routes side by side that differ only in what they call a parameter,
 * such as `patients/:id/edit` and `patients/:patientId/edit`, are one
 * address. React Router gives it to whichever is listed first and the
 * other can never be reached, with nothing to say so. That is how the
 * working form for editing a patient sat unreachable behind a placeholder.
 */
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import type { RouteObject } from "react-router-dom";
import RequireAuth from "@/auth/RequireAuth";
import { isGuestPath } from "@lib/api";
import { routes } from "@/routes";

/** A path with its parameter names taken out: `a/:id/edit` is `a/:/edit`. */
function shape(path: string): string {
  return path
    .split("/")
    .map((part) => (part.startsWith(":") ? ":" : part))
    .join("/");
}

/** Every list of routes that sit side by side, at any depth. */
function siblingLists(list: RouteObject[]): RouteObject[][] {
  return [list, ...list.flatMap((route) => siblingLists(route.children ?? []))];
}

/** The path shapes that more than one route in a list answers to. */
function clashes(list: RouteObject[]): string[] {
  const shapes = list
    .filter((route) => route.path !== undefined)
    .map((route) => shape(route.path as string));

  return shapes.filter((item, index) => shapes.indexOf(item) !== index);
}

describe("routes", () => {
  it("has enough side-by-side lists to be worth checking", () => {
    // A walk that finds nothing passes, so make sure it finds the tree.
    expect(siblingLists(routes).length).toBeGreaterThan(10);
  });

  it("gives no address to two routes side by side", () => {
    const found = siblingLists(routes).flatMap(clashes);

    expect(found).toEqual([]);
  });

  it("sees a clash that differs only in a parameter's name", () => {
    const list: RouteObject[] = [
      { path: "patients/:patientId/edit" },
      { path: "patients/edit" },
      { path: "patients/:id/edit" },
    ];

    expect(clashes(list)).toEqual(["patients/:/edit"]);
  });

  it("does not take a fixed word for a parameter", () => {
    const list: RouteObject[] = [
      { path: "patients/new" },
      { path: "patients/:id" },
      { path: "patients/list" },
    ];

    expect(clashes(list)).toEqual([]);
  });
});

/**
 * A page somebody who is not signed in can open needs two things: no
 * `RequireAuth` round its route, and its path in `GUEST_PATHS` in
 * `lib/api.ts`. The second is the one that gets forgotten. The page then
 * loads, `AuthContext` asks `/api/auth/me`, the 401 arrives as it should,
 * and the visitor is sent to `/login` before they can do anything. That
 * happened to the invited assessor's page, the public guides and the
 * newsletter unsubscribe link.
 */

/** Whether a top-level route is wrapped in `RequireAuth`. */
function requiresAuth(route: RouteObject): boolean {
  return isValidElement(route.element) && route.element.type === RequireAuth;
}

/**
 * Routes open to somebody not signed in that are deliberately not guest
 * paths, each with its reason. Adding one is a decision, so it is written
 * down here and not inferred.
 */
const OPEN_BUT_NOT_GUEST: Record<string, string> = {
  // Any address nothing else matches. A signed-out visitor to an unknown
  // address under the app has no business there, and being sent to
  // `/login` by the 401 is the right outcome.
  "*": "the 404 page",
};

/** Top-level routes with no `RequireAuth` whose path is not a guest path. */
function openRoutesMissingFromGuestPaths(list: RouteObject[]): string[] {
  return list
    .filter((route) => !requiresAuth(route))
    .map((route) => route.path ?? "(no path)")
    .filter((path) => !(path in OPEN_BUT_NOT_GUEST))
    .filter((path) => !isGuestPath(path));
}

describe("routes open to somebody not signed in", () => {
  it("finds both kinds of route, so the check is not passing on nothing", () => {
    const guarded = routes.filter(requiresAuth);
    const open = routes.filter((route) => !requiresAuth(route));

    expect(guarded.length).toBeGreaterThan(1);
    expect(open.length).toBeGreaterThan(5);
  });

  it("has every one of them on the guest list in lib/api.ts", () => {
    expect(openRoutesMissingFromGuestPaths(routes)).toEqual([]);
  });

  it("sees an open route that was left off the list", () => {
    const list: RouteObject[] = [
      { path: "/login" },
      { path: "/new-public-page" },
      { path: "*" },
    ];

    expect(openRoutesMissingFromGuestPaths(list)).toEqual(["/new-public-page"]);
  });

  it("takes a page beneath a guest path as covered", () => {
    const list: RouteObject[] = [{ path: "/guides/:slug" }];

    expect(openRoutesMissingFromGuestPaths(list)).toEqual([]);
  });

  it("does not take a longer word for a page beneath a guest path", () => {
    // `/guides-archive` is not under `/guides`.
    expect(isGuestPath("/guides-archive")).toBe(false);
    expect(isGuestPath("/guides")).toBe(true);
    expect(isGuestPath("/guides/how-to-join")).toBe(true);
  });
});
