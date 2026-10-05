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

import type { CompetencyId } from "@/types/cbac";

/**
 * Who a guide is written for. A reader sees their own audience and every
 * one below it: `everyone`, then `admin`, then `superadmin`.
 *
 * The lowest was `delegate` while every guide was teaching's. A passport
 * holder and a safety officer are not delegates, and the list already
 * headed the group "For everyone".
 */
export type GuideAudience = "everyone" | "admin" | "superadmin";

/** Lowest first. A reader's tier is their place in this list. */
export const GUIDE_AUDIENCES: readonly GuideAudience[] = [
  "everyone",
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
  feature?: GuideFeature;
  /**
   * Shown only to somebody holding this competency, when given. A feature
   * says whether an organisation has the passport at all; within it, a
   * guide to signing somebody off is an assessor's and a guide to keeping
   * a logbook is a holder's, and tier does not tell those apart. An
   * operator is shown the guide whatever they hold.
   */
  competency?: CompetencyId;
}

/**
 * The features that have guides, in the order the list shows them, each
 * with the name its group is headed by.
 */
export const GUIDE_FEATURES = {
  teaching: "Teaching",
  passport: "Passport",
  safety: "Safety",
} as const;

export type GuideFeature = keyof typeof GUIDE_FEATURES;

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
    audience: "everyone",
    public: true,
    feature: "teaching",
  },
  {
    slug: "take-a-module-and-its-assessment",
    title: "Take a module and its assessment",
    summary:
      "Read the learning materials, sit the assessment and see how you did.",
    audience: "everyone",
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
  {
    slug: "find-your-way-round-a-safety-case",
    title: "Find your way round a safety case",
    summary: "See every safety case, open one and learn its six parts.",
    audience: "everyone",
    public: false,
    feature: "safety",
    competency: "view_safety_cases",
  },
  {
    slug: "read-and-edit-a-safety-document",
    title: "Read and edit a safety document",
    summary: "Open a case's documents, read one as a page and change its text.",
    audience: "everyone",
    public: false,
    feature: "safety",
    competency: "view_safety_cases",
  },
  {
    slug: "read-the-hazard-log",
    title: "Read the hazard log",
    summary: "See each hazard, its risk before and after, and what was done.",
    audience: "everyone",
    public: false,
    feature: "safety",
    competency: "view_safety_cases",
  },
  {
    slug: "read-an-incident-report",
    title: "Read an incident report",
    summary: "Find what went wrong in use, and the hazard it belongs to.",
    audience: "everyone",
    public: false,
    feature: "safety",
    competency: "view_safety_cases",
  },
  {
    slug: "change-a-safety-officer",
    title: "Change a safety officer",
    summary: "See who is answerable for a case, and change a role's holder.",
    audience: "everyone",
    public: false,
    feature: "safety",
    competency: "view_safety_cases",
  },
  {
    slug: "check-what-has-been-signed-off",
    title: "Check what has been signed off",
    summary: "See which sections are signed, by whom, and what each covers.",
    audience: "everyone",
    public: false,
    feature: "safety",
    competency: "view_safety_cases",
  },
  {
    slug: "start-your-passport",
    title: "Start your passport",
    summary: "Create your passport and learn its six parts.",
    audience: "everyone",
    public: false,
    feature: "passport",
    competency: "passport_write",
  },
  {
    slug: "ask-for-a-sign-off",
    title: "Ask for a sign-off",
    summary: "Name an assessor for a competency, and see what they decide.",
    audience: "everyone",
    public: false,
    feature: "passport",
    competency: "passport_write",
  },
  {
    slug: "keep-your-logbook",
    title: "Keep your logbook",
    summary: "Record the procedures you have performed.",
    audience: "everyone",
    public: false,
    feature: "passport",
    competency: "passport_write",
  },
  {
    slug: "record-cpd",
    title: "Record CPD",
    summary: "Record activities, and total them over your appraisal year.",
    audience: "everyone",
    public: false,
    feature: "passport",
    competency: "passport_write",
  },
  {
    slug: "add-a-certificate",
    title: "Add a certificate",
    summary: "Record a course or qualification, with its file.",
    audience: "everyone",
    public: false,
    feature: "passport",
    competency: "passport_write",
  },
  {
    slug: "write-a-reflection",
    title: "Write a reflection",
    summary: "Write up what you took from a case or an event.",
    audience: "everyone",
    public: false,
    feature: "passport",
    competency: "passport_write",
  },
  {
    slug: "download-your-passport",
    title: "Download your passport",
    summary: "Take your whole record with you, as a PDF or in full.",
    audience: "everyone",
    public: false,
    feature: "passport",
    competency: "assess_clinician_passport",
  },
  {
    slug: "sign-somebody-off",
    title: "Sign somebody off",
    summary: "Find a colleague's request in your inbox and sign it.",
    audience: "everyone",
    public: false,
    feature: "passport",
    competency: "assess_clinician_passport",
  },
  {
    slug: "accept-an-invitation-to-assess",
    title: "Accept an invitation to assess",
    summary: "What to do with the email asking you to assess a colleague.",
    audience: "everyone",
    public: true,
    feature: "passport",
    competency: "assess_clinician_passport",
  },
  {
    slug: "add-somebody-to-the-passport",
    title: "Add somebody to the passport",
    summary: "Give somebody an account that can keep a passport.",
    audience: "admin",
    public: false,
    feature: "passport",
    competency: "manage_passport",
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
