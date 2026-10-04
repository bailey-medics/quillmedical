/**
 * Every page says where it is in the side navigation.
 *
 * Walks the whole route list and, for each page, renders the menu at
 * that page's address and checks two things:
 *
 * 1. **The page has a link of its own, and it is the one that is lit.**
 *    A page whose parent is lit instead looks, in the menu, exactly like
 *    the parent page: nothing says a second page is open.
 * 2. **The link is nested under the pages above it.** Each page above
 *    this one has its own link, earlier in the menu and less indented.
 *    "Above" is read from the address (`/a/b` sits under `/a`) and,
 *    where the address does not say it, from `NESTS_UNDER`.
 *
 * A route added to `routes.tsx` is checked without being named here, so
 * a new page fails this test until the menu knows about it. The two
 * lists below are the only ways out, and each is checked for entries
 * that have stopped being true.
 *
 * The menu comes from three places, and the test renders each as the
 * app does:
 *
 * - **The main sidebar** works its links out from the address alone, so
 *   `SideNavContent` is rendered on its own.
 * - **Patient pages and message threads** hand their links to the layout
 *   through `setPatientNav`, so the page itself is rendered, inside a
 *   stand-in for `RootLayout` that passes them to the sidebar.
 * - **Teaching pages** render their own sidebar, so the page is rendered.
 */

import { act } from "@testing-library/react";
import { useState } from "react";
import {
  createMemoryRouter,
  generatePath,
  Outlet,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithMantine } from "@test/test-utils";
import type { LayoutCtx } from "@/RootLayout";
import type { Patient } from "@/domains/patient";
import ErrorBoundary from "@/components/error-boundary/ErrorBoundary";
import type { NavItem } from "./NestedNavLink";

// Somebody who may open every page, so no link is missing for want of a
// competency or a feature.
vi.mock("@/auth/AuthContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth/AuthContext")>()),
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: {
        id: "1",
        username: "sample.user",
        email: "sample@example.com",
        roles: ["Clinician"],
        platform_role: "superadmin",
        clinical_services_enabled: true,
        enabled_features: ["teaching", "passport", "safety"],
        competencies: [
          "manage_users",
          "manage_teaching",
          "assess_clinician_passport",
          "passport_write",
          "view_safety_cases",
        ],
      },
    },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock("@lib/connectivity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lib/connectivity")>()),
  useConnectivity: () => ({
    isOnline: true,
    isReconnected: false,
    lastSyncedAt: null,
  }),
}));

vi.mock("@lib/compat-generation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lib/compat-generation")>()),
  useForcedReload: () => ({ phase: "idle" }),
}));

/**
 * What the server would say, for the few answers the menu waits on: the
 * name of the record that is open. Anything else is refused, which a
 * page shows as its own error and which leaves the menu alone.
 */
function sampleAnswer(path: string): unknown {
  const samples: [RegExp, unknown][] = [
    [
      /^\/patients\/[^/]+\/demographics$/,
      {
        patient_id: "1",
        data: {
          resourceType: "Patient",
          id: "1",
          name: [{ given: ["Sam"], family: "Sample" }],
        },
      },
    ],
    [/^\/patients\/[^/]+$/, { name: [{ given: ["Sam"], family: "Sample" }] }],
    [/^\/users\/[^/]+$/, { username: "sample.user" }],
    [
      /^\/org-units\/\d+$/,
      {
        id: 1,
        name: "Sample place",
        parent_id: null,
        parent_name: null,
        parent_is_root: false,
      },
    ],
    [/^\/org-units\/\d+\/members\/\d+\/practice$/, { username: "a.member" }],
    [/^\/teaching\/admin\/banks\/[^/]+$/, { title: "Module" }],
    [
      /^\/teaching\/question-banks$/,
      [{ question_bank_id: "1", title: "Module", description: "" }],
    ],
    [
      /^\/teaching\/question-banks\/[^/]+$/,
      { title: "Module", config_yaml: {}, is_live: true },
    ],
    [/^\/teaching\/assessments\/history$/, []],
    [
      /^\/teaching\/assessments\/[^/]+\/question-results$/,
      {
        assessment_id: 1,
        question_bank_id: "1",
        bank_version: 1,
        bank_title: "Module",
        exam_ref: "EX-0001",
        completed_at: "2026-09-27T10:00:00Z",
        is_passed: true,
        criteria: [],
        questions: [],
      },
    ],
    [
      /^\/teaching\/assessments\/[^/]+$/,
      {
        id: 1,
        question_bank_id: "1",
        bank_version: 1,
        started_at: "2026-09-27T09:00:00Z",
        completed_at: "2026-09-27T10:00:00Z",
        time_limit_minutes: 60,
        total_items: 0,
        is_passed: true,
        score_breakdown: { criteria: [] },
      },
    ],
    [/^\/teaching\/syncs$/, []],
    [
      /^\/conversations\/[^/]+$/,
      {
        id: 1,
        subject: "A thread",
        patient_id: null,
        messages: [],
        participants: [],
      },
    ],
  ];
  const found = samples.find(([pattern]) => pattern.test(path));
  if (!found) throw new Error(`No sample answer for ${path}`);
  return found[1];
}

vi.mock("@/lib/api", async (importOriginal) => {
  const answer = (path: string) =>
    new Promise((resolve, reject) => {
      try {
        resolve(sampleAnswer(path.split("?")[0]));
      } catch (error) {
        reject(error);
      }
    });
  return {
    ...(await importOriginal<typeof import("@/lib/api")>()),
    api: {
      get: vi.fn(answer),
      post: vi.fn(answer),
      put: vi.fn(answer),
      patch: vi.fn(answer),
      del: vi.fn(answer),
    },
  };
});

import { routes } from "@/routes";
import SideNavContent from "./SideNavContent";

// ---------------------------------------------------------------------
// The two ways out. Keys are route patterns, as `routes.tsx` joins
// them: "/admin/users/:id/edit".
// ---------------------------------------------------------------------

/**
 * Pages that rightly have no link, each with the reason. A page here is
 * not rendered at all.
 */
const SIGNED_OUT = "Shown to somebody who is not signed in: there is no menu.";
const NO_LINK: Record<string, string> = {
  "/login": SIGNED_OUT,
  "/register": SIGNED_OUT,
  "/teaching/register/:module": SIGNED_OUT,
  "/forgot-password": SIGNED_OUT,
  "/reset-password": SIGNED_OUT,
  "/verify-email": SIGNED_OUT,
  "/verify-email-pending": SIGNED_OUT,
  "/passport/assessors/accept":
    "The invite landing, opened by somebody with no account.",
  "/passport/verify/:signOffId":
    "Opened from the QR code on a printed passport, with no session.",
  "/teaching/assessment/:id":
    "An exam in progress shows the question and nothing else.",
  "/teaching/learn/:moduleId": "Only redirects to the module's first slide.",
  "/teaching/learn/:moduleId/slide/:slideIndex":
    "The sidebar is the list of slides while a module is being read.",
};

/**
 * Pages whose place in the menu is not the one their address gives.
 * The value is the page they sit under.
 */
const NESTS_UNDER: Record<string, string> = {
  // A result belongs to the module it was sat in, which the address
  // does not name; "Results by question" is beside "Result" in the
  // address and beneath it in the menu.
  "/teaching/assessment/:id/result": "/teaching/:bankId",
  "/teaching/assessment/:id/question-results":
    "/teaching/assessment/:id/result",
  // With Organisations offered, one site's pages are named under it,
  // beneath whichever place holds the site, and Sites lights for the
  // list alone. See the Sites entry in `SideNavContent`.
  "/admin/sites/:id": "/admin/organisations",
  // Editing a safety document hangs "Edit" where the document would
  // be, so the menu does not grow a third level for a form.
  "/safety/:caseId/documentation/:documentId/edit":
    "/safety/:caseId/documentation",
  // Signing somebody off is opened from the inbox.
  "/passport/sign-off/:signOffId": "/passport/inbox",
};

/**
 * A value for each `:param`, chosen so the sample data knows the record.
 * Anything unnamed is "1".
 */
const SAMPLE_PARAMS: Record<string, string> = {
  letterId: "letter-1",
  slideIndex: "0",
};

/** Addresses whose menu entries come from the page, so it is rendered. */
const PAGE_SUPPLIES_MENU = [/^\/patients\//, /^\/messages\/./, /^\/teaching/];

// ---------------------------------------------------------------------
// The route list, flattened to one entry per page.
// ---------------------------------------------------------------------

type Page = { pattern: string; address: string; route: RouteObject };

function joinPaths(parent: string, child: string | undefined): string {
  if (!child) return parent;
  if (child.startsWith("/")) return child;
  return `${parent.replace(/\/$/, "")}/${child}`;
}

function addressOf(pattern: string): string {
  const names = [...pattern.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]);
  const params = Object.fromEntries(
    names.map((name) => [name, SAMPLE_PARAMS[name] ?? "1"]),
  );
  return generatePath(pattern, params);
}

function flatten(list: RouteObject[], parent = ""): Page[] {
  return list.flatMap((route) => {
    const pattern = joinPaths(parent, route.path);
    const below = route.children ? flatten(route.children, pattern) : [];
    // A page is a route that shows something itself: an index route, or
    // a path with an element. Layout routes with children only pass
    // through, and the catch-all is the 404.
    const isPage =
      route.path !== "*" &&
      (route.index === true ||
        (route.path !== undefined && !route.children?.length));
    return isPage
      ? [{ pattern, address: addressOf(pattern), route }, ...below]
      : below;
  });
}

// Two routes can differ only in what they call a parameter, as
// `patients/:id/edit` and `patients/:patientId/edit` do; they are one
// address and one menu, so one check.
const PAGES: Page[] = flatten(routes).filter(
  (page, index, all) =>
    all.findIndex((other) => other.address === page.address) === index,
);
const PATTERNS = new Set(flatten(routes).map((page) => page.pattern));

/** Whether the menu is expected to hold a link to this page. */
function hasLink(pattern: string): boolean {
  return !(pattern in NO_LINK);
}

/** The page this one sits under, if any. */
function pageAbove(pattern: string): string | undefined {
  if (pattern in NESTS_UNDER) return NESTS_UNDER[pattern];
  const segments = pattern.split("/").filter(Boolean);
  for (let length = segments.length - 1; length > 0; length -= 1) {
    const candidate = `/${segments.slice(0, length).join("/")}`;
    if (PATTERNS.has(candidate)) return candidate;
  }
  return undefined;
}

/**
 * The pages above this one that have a link, outermost first, as
 * addresses. A page with no link is passed over, and the ones above it
 * still count.
 */
function pagesAbove(pattern: string): string[] {
  const above = pageAbove(pattern);
  if (above === undefined) return [];
  return [...pagesAbove(above), ...(hasLink(above) ? [addressOf(above)] : [])];
}

// ---------------------------------------------------------------------
// Rendering the menu at one address.
// ---------------------------------------------------------------------

/**
 * Stands in for `RootLayout`: holds what a page hands to the sidebar and
 * passes it on. The real one adds the ribbon, search and page-view
 * counting, none of which changes a link.
 */
function MainMenuAndPage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientNav, setPatientNav] = useState<NavItem[]>([]);
  const context: LayoutCtx = {
    patient,
    setPatient,
    patientNav,
    setPatientNav,
    examMode: false,
    setExamMode: () => {},
    fluid: false,
    setFluid: () => {},
  };
  return (
    <>
      <SideNavContent patientNav={patientNav} />
      <ErrorBoundary>
        <Outlet context={context} />
      </ErrorBoundary>
    </>
  );
}

type MenuLink = { label: string; href: string; lit: boolean; indent: number };

async function menuAt(page: Page): Promise<MenuLink[]> {
  const rendersPage = PAGE_SUPPLIES_MENU.some((prefix) =>
    prefix.test(page.address),
  );
  // The page as its route gives it: an element, or a lazy chunk the
  // router loads before it shows anything.
  const pageRoute: RouteObject = rendersPage
    ? { path: page.pattern, element: page.route.element, lazy: page.route.lazy }
    : { path: page.pattern, element: null };
  // Loaded here first, so the wait below is only ever for the page's
  // own requests and not for a chunk's first import.
  if (rendersPage && typeof page.route.lazy === "function") {
    await page.route.lazy();
  }
  const tree: RouteObject[] = page.address.startsWith("/teaching")
    ? [pageRoute]
    : [{ element: <MainMenuAndPage />, children: [pageRoute] }];

  const router = createMemoryRouter(tree, { initialEntries: [page.address] });
  const { container } = renderWithMantine(<RouterProvider router={router} />);

  // Record names arrive from the server a moment after the first paint,
  // and a member's page asks twice in a row.
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  const links = [
    ...container.querySelectorAll<HTMLElement>("a.mantine-NavLink-root"),
  ].map((link) => ({
    label: link.textContent ?? "",
    href: link.getAttribute("href") ?? "",
    lit: link.hasAttribute("data-active"),
    indent: Number.parseFloat(link.style.paddingLeft || "0"),
  }));

  // The teaching layout holds its sidebar twice, once for the drawer a
  // narrow screen opens, so the same menu comes back end to end.
  const half = links.length / 2;
  const isDoubled =
    Number.isInteger(half) &&
    half > 0 &&
    JSON.stringify(links.slice(0, half)) === JSON.stringify(links.slice(half));
  return isDoubled ? links.slice(0, half) : links;
}

function describeMenu(links: MenuLink[]): string {
  return links
    .map(
      (link) =>
        `${" ".repeat(Math.round(link.indent * 2))}${link.lit ? "●" : "○"} ` +
        `${link.label} (${link.href})`,
    )
    .join("\n");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the side navigation covers every page", () => {
  it("finds the pages", () => {
    // Guards the walk itself: an empty list would pass every check below.
    expect(PAGES.length).toBeGreaterThan(80);
  });

  it.each([
    ["NO_LINK", Object.keys(NO_LINK)],
    [
      "NESTS_UNDER",
      [...Object.keys(NESTS_UNDER), ...Object.values(NESTS_UNDER)],
    ],
  ])("%s names only pages that exist", (_list, patterns) => {
    expect(patterns.filter((pattern) => !PATTERNS.has(pattern))).toEqual([]);
  });

  const checked = PAGES.filter((page) => !(page.pattern in NO_LINK));

  it.each(checked.map((page) => [page.pattern, page] as const))(
    "%s",
    async (_pattern, page) => {
      const links = await menuAt(page);
      const menu = `\n\nThe menu at ${page.address}:\n${describeMenu(links)}\n`;
      const lit = links.filter((link) => link.lit);
      const own = lit.find((link) => link.href === page.address);

      const found =
        lit.length === 0
          ? "nothing is lit"
          : !own
            ? "only the page above is lit"
            : lit.length > 1
              ? "two links are lit"
              : undefined;

      expect(
        found,
        `${page.pattern}: ${found}. Every page needs one lit link of its ` +
          `own, so give it one where the menu is built. If the page ` +
          `should have no link at all, add it to NO_LINK with the ` +
          `reason.${menu}`,
      ).toBeUndefined();

      const ownIndex = links.indexOf(own!);
      let outer = -1;
      for (const above of pagesAbove(page.pattern)) {
        const index = links.findIndex((link) => link.href === above);
        expect(
          index,
          `${page.pattern} sits under ${above}, which has no link in the ` +
            `menu. If it sits under a different page, say which in ` +
            `NESTS_UNDER.${menu}`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          index < ownIndex && links[index].indent < own!.indent,
          `${page.pattern} is not nested under ${above}: its link should ` +
            `come after it and be indented further.${menu}`,
        ).toBe(true);
        expect(
          links[index].indent,
          `${above} is not nested under the page above it.${menu}`,
        ).toBeGreaterThan(outer);
        outer = links[index].indent;
      }
    },
  );
});
