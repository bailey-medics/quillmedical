/**
 * The guides: short task instructions for the people who use Quill.
 *
 * One entry per guide. The words are a markdown file of the same name in
 * `content/`, kept apart so this list stays small enough to sit in first
 * load, where the side navigation asks it whether there is anything to
 * offer. The files themselves arrive with the guides' lazy chunk. See
 * `docs/docs/plans/2026-10-05-in-app-guides-plan.md`.
 *
 * A registry in TypeScript and not front matter in each file, so an
 * audience is a type the compiler checks and a link to a guide that has
 * been removed fails the typecheck.
 */

/**
 * Who a guide is written for. A reader sees their own audience and every
 * one below it: `delegate`, then `admin`, then `superadmin`.
 */
export type GuideAudience = "delegate" | "admin" | "superadmin";

/** Lowest first. A reader's tier is their place in this list. */
export const GUIDE_AUDIENCES: readonly GuideAudience[] = [
  "delegate",
  "admin",
  "superadmin",
];

export interface Guide {
  /** The address, `/guides/<slug>`, and the name of the markdown file. */
  slug: string;
  /** Sentence case. Also the `#` heading of the markdown file. */
  title: string;
  /** One line under the title in the list of guides. */
  summary: string;
  audience: GuideAudience;
  /** Whether it may be read by somebody who is not signed in. */
  public: boolean;
  /** Shown only where this feature is switched on, when given. */
  feature?: string;
}

export const GUIDES = [
  {
    slug: "add-a-delegate-by-hand",
    title: "Add a delegate by hand",
    summary:
      "Create an account for somebody who cannot register for themselves.",
    audience: "admin",
    public: false,
    feature: "teaching",
  },
  {
    slug: "join-a-course",
    title: "Join a course",
    summary: "Register, confirm your email address and sign in.",
    audience: "delegate",
    public: true,
    feature: "teaching",
  },
  {
    slug: "take-a-module-and-its-assessment",
    title: "Take a module and its assessment",
    summary:
      "Read the learning materials, sit the assessment and see how you did.",
    audience: "delegate",
    public: false,
    feature: "teaching",
  },
  {
    slug: "see-delegates-results",
    title: "See delegates' results",
    summary: "Find who has attempted a module, and who has passed.",
    audience: "admin",
    public: false,
    feature: "teaching",
  },
  {
    slug: "assign-a-teaching-admin",
    title: "Assign a teaching admin",
    summary:
      "Give somebody the role that adds delegates and sees their results.",
    audience: "superadmin",
    public: false,
    feature: "teaching",
  },
] as const satisfies readonly Guide[];

export type GuideSlug = (typeof GUIDES)[number]["slug"];

/** The guide at this slug, whoever is asking. */
export function findGuide(slug: string | undefined): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

/**
 * The address of a guide. Takes a slug from the registry and nothing
 * else, so a link to a guide that has been removed fails the typecheck.
 */
export function guidePath(slug: GuideSlug): string {
  return `/guides/${slug}`;
}

/**
 * Where a guide's screenshots are served from. A guide names an image by
 * its place beneath this: `![The form](add-a-delegate-by-hand/form.png)`.
 *
 * The images are not in the repository. Playwright retakes them from
 * seeded data; in production they live in a bucket routed to this path,
 * and locally in `frontend/public/guide-assets/`, which is ignored by git.
 */
export const GUIDE_ASSETS_PATH = "/guide-assets";
