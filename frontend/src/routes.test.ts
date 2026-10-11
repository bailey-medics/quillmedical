/**
 * Route list tests
 *
 * Two routes side by side that differ only in what they call a parameter,
 * such as `patients/:id/edit` and `patients/:patientId/edit`, are one
 * address. React Router gives it to whichever is listed first and the
 * other can never be reached, with nothing to say so. That is how the
 * working form for editing a patient sat unreachable behind a placeholder.
 */
import { describe, expect, it } from "vitest";
import type { RouteObject } from "react-router-dom";
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
