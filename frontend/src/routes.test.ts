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
import GuestOnly from "@/auth/GuestOnly";
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
 * Whether a page is open to somebody who is not signed in is said in one
 * place: its route has no `RequireAuth`. Nothing else has to agree with
 * it, since `lib/api.ts` no longer sends anybody to `/login`.
 *
 * That makes leaving the guard off the only thing that can go wrong, and
 * it fails open: the page is public. So every top-level route must be
 * behind `RequireAuth`, behind `GuestOnly`, or named below with the reason
 * it is open.
 */

/** Whether a top-level route is wrapped in the given guard. */
function wrappedIn(route: RouteObject, guard: unknown): boolean {
  return isValidElement(route.element) && route.element.type === guard;
}

/**
 * The routes anybody may open, signed in or not, each with its reason.
 * Adding one is a decision, so it is written down here and not inferred.
 */
const OPEN_TO_ANYBODY: Record<string, string> = {
  "/unsubscribe":
    "the link in a newsletter, which must work signed in or signed out",
  "/guides/:slug":
    "some guides are read before there is an account to sign in to",
  "/passport/assessors/accept":
    "an invited assessor has no account yet; the signed token admits them",
  "*": "the 404 page",
};

/** Top-level routes with no guard that are not named as open. */
function unguardedRoutes(list: RouteObject[]): string[] {
  return list
    .filter((route) => !wrappedIn(route, RequireAuth))
    .filter((route) => !wrappedIn(route, GuestOnly))
    .map((route) => route.path ?? "(no path)")
    .filter((path) => !(path in OPEN_TO_ANYBODY));
}

describe("routes open to somebody not signed in", () => {
  it("finds every kind of route, so the check is not passing on nothing", () => {
    expect(
      routes.filter((route) => wrappedIn(route, RequireAuth)).length,
    ).toBeGreaterThan(1);
    expect(
      routes.filter((route) => wrappedIn(route, GuestOnly)).length,
    ).toBeGreaterThan(3);
  });

  it("are only the ones named as open", () => {
    expect(unguardedRoutes(routes)).toEqual([]);
  });

  it("names no route that does not exist", () => {
    // A name left behind after its route has gone would quietly allow a
    // later route of the same path to be open.
    const paths = routes.map((route) => route.path);

    for (const path of Object.keys(OPEN_TO_ANYBODY)) {
      expect(paths).toContain(path);
    }
  });

  it("sees a route added with no guard", () => {
    const list: RouteObject[] = [
      { path: "/unsubscribe" },
      { path: "/new-page-with-no-guard" },
      { path: "*" },
    ];

    expect(unguardedRoutes(list)).toEqual(["/new-page-with-no-guard"]);
  });
});
