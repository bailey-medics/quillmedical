/**
 * Every page a guide links to exists, and is one a link may lead to.
 *
 * A guide names the pages it sends its reader to, and each name is a link
 * to that page. Nothing else ties a guide to the route list, so without
 * this a renamed or removed page leaves a guide pointing at a 404.
 *
 * Three kinds of page are never linked, because a guide has no one
 * address to give or should not give one:
 *
 * - a page of one person or one record, whose address holds an id;
 * - the learning materials, which belong to one module; and
 * - an assessment, which a stray press on a link must never start.
 */

import type { RouteObject } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { routes } from "@/routes";
import { CONTENT_SLUGS, guideBody } from "./content";
import { GUIDES } from "./registry";

function joinPaths(parent: string, child: string | undefined): string {
  if (!child) return parent;
  if (child.startsWith("/")) return child;
  return `${parent.replace(/\/$/, "")}/${child}`;
}

/** Every address in the route list, as a pattern: "/admin/users/:id". */
function patterns(list: RouteObject[], parent = ""): string[] {
  return list.flatMap((route) => {
    const pattern = joinPaths(parent, route.path);
    const below = route.children ? patterns(route.children, pattern) : [];
    return route.path === undefined || route.path === "*"
      ? below
      : [pattern, ...below];
  });
}

const PAGES = new Set(patterns(routes));

/** Pages with one address, the same for everybody. */
const LINKABLE = new Set([...PAGES].filter((page) => !page.includes(":")));

const NEVER_LINKED = [
  /^\/teaching\/learn(\/|$)/,
  /^\/teaching\/assessment(\/|$)/,
];

/** The links a guide makes to pages of Quill, images left out. */
function internalLinks(slug: string): string[] {
  const body = guideBody(slug) ?? "";
  return [...body.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => (match[1] ?? "").trim())
    .filter((href) => href.startsWith("/"));
}

/** A link to another guide, which the route list knows only as `:slug`. */
function isGuide(href: string): boolean {
  return CONTENT_SLUGS.some((slug) => href === `/guides/${slug}`);
}

describe.each(GUIDES)("the links in $slug", (guide) => {
  const links = internalLinks(guide.slug);

  it("all lead to a page that exists, with one address for everybody", () => {
    const broken = links.filter(
      (href) => !LINKABLE.has(href) && !isGuide(href),
    );

    expect(broken).toEqual([]);
  });

  it("never lead into the learning materials or an assessment", () => {
    const forbidden = links.filter((href) =>
      NEVER_LINKED.some((pattern) => pattern.test(href)),
    );

    expect(forbidden).toEqual([]);
  });
});

describe("the check itself", () => {
  it("reads the route list", () => {
    expect(LINKABLE.has("/admin/users")).toBe(true);
    expect(LINKABLE.has("/guides")).toBe(true);
  });

  it("would refuse a page of one record", () => {
    expect(PAGES.has("/admin/users/:id")).toBe(true);
    expect(LINKABLE.has("/admin/users/:id")).toBe(false);
    expect(LINKABLE.has("/admin/users/7")).toBe(false);
  });

  it("finds the links the guides make", () => {
    expect(internalLinks("add-a-delegate-by-hand")).toContain("/admin/users");
    expect(internalLinks("join-a-course")).toContain("/register");
  });

  it("does not take a picture for a link", () => {
    const links = GUIDES.flatMap((guide) => internalLinks(guide.slug));

    expect(links.filter((href) => href.endsWith(".png"))).toEqual([]);
  });
});
