/**
 * Cross-feature navigation entries.
 *
 * The one org_unit that decides which features appear in the sidebar. Both
 * the main sidebar and the teaching one render what this returns, so a
 * feature added here shows up in both – and, more to the point, cannot
 * show up in one and not the other.
 *
 * That is not a hypothetical tidiness argument. The teaching sidebar
 * used to carry its own hardcoded list, and a holder who opened
 * `/teaching` watched the Passport link vanish: the entry existed only
 * in the main sidebar. Settings and Admin were duplicated across both
 * files too, along with the `manage_users` gate gating Admin, so the
 * two lists had to be kept in step by whoever remembered.
 *
 * Each entry carries its own gate, so the question "who may see this?"
 * is answered once, beside the link, rather than at each call site.
 *
 * What does *not* belong here is anything contextual – the patient
 * breadcrumb, the clinical Home and Messages links, teaching's current
 * module. Those depend on where the user is rather than on what the
 * app offers, so they stay with the sidebar that knows about them.
 */

import { useLocation } from "react-router-dom";
import { INBOX_PATH } from "@/lib/inbox/inbox";

import { useCanReachPassport, useHasFeature } from "@/lib/features";
import { useHasAnyCompetency, useHasCompetency } from "@/lib/cbac/hooks";
import type { NavItem } from "./NestedNavLink";
import { SCOPED_MANAGER_IDS } from "@/types/cbac";

/**
 * The passport's own pages, each shown as a child of Passport while it is
 * open. Named as the side navigation should say them, which is shorter
 * than some page titles: "CPD" rather than "Continuing professional
 * development".
 *
 * A page with a `detail` label also has pages of one record beneath it:
 * a single sign-off, logbook entry, CPD activity, certificate or
 * reflection. On one of those the section's link gains a child of its
 * own, so the navigation reads Passport, CPD, Activity rather than
 * stopping at CPD.
 */
const PASSPORT_PAGES: readonly (NavItem & { detail?: string })[] = [
  { label: "Sign-offs", href: "/passport/sign-offs", detail: "Sign-off" },
  { label: "Logbook", href: "/passport/logbook", detail: "Entry" },
  { label: "CPD", href: "/passport/cpd", detail: "Activity" },
  {
    label: "Certificates",
    href: "/passport/certificates",
    detail: "Certificate",
  },
  { label: "Reflections", href: "/passport/reflections", detail: "Reflection" },
  { label: "Download", href: "/passport/download" },
];

/** Where an assessor signs off one request: `/passport/sign-off/:id`. */
const SIGN_OFF_PREFIX = "/passport/sign-off/";

/**
 * The passport page this address is, or sits beneath, if any, with the
 * record's own link beneath it on the page of one record.
 */
function passportPageAt(pathname: string): NavItem | undefined {
  // Signing somebody off is reached from the inbox, the page of
  // everything waiting on somebody, which has no entry in the menu. So
  // the sign-off hangs straight under Passport. The passport had a queue
  // page of its own between the two until 4 October 2026.
  if (pathname.startsWith(SIGN_OFF_PREFIX)) {
    return { label: "Sign off", href: pathname };
  }

  const page = PASSPORT_PAGES.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (!page) return undefined;

  const { detail, ...link } = page;
  return detail && pathname !== page.href
    ? { ...link, children: [{ label: detail, href: pathname }] }
    : link;
}

/**
 * The pages of one safety case, each shown as a child of Safety while it
 * is open. The address carries the case id, so these are matched on the
 * segment after it rather than on a fixed prefix.
 *
 * The safety feature is a mock-up with no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */
const SAFETY_PAGES: readonly {
  label: string;
  segment: string;
  detail?: string;
}[] = [
  { label: "Documentation", segment: "documentation", detail: "Document" },
  { label: "Hazards", segment: "hazards", detail: "Hazard" },
  { label: "Incidents", segment: "incidents", detail: "Incident" },
  { label: "Officers", segment: "officers" },
  { label: "Compliance sign-off", segment: "sign-off", detail: "Section" },
  { label: "Placeholders", segment: "placeholders", detail: "Edit" },
];

/**
 * The safety case this address is, or sits within, if any. The case has
 * a link of its own, `/safety/:caseId`, with the open page of the case
 * beneath it, `/safety/:caseId/:segment`, and the record's own link
 * beneath that on `/safety/:caseId/:segment/:recordId`, as the
 * passport's does. The landing page hangs nothing beneath Safety.
 */
function safetyPageAt(pathname: string): NavItem | undefined {
  const match = pathname.match(
    /^\/safety\/([^/]+)(?:\/([^/]+)(\/[^/]+)?(\/edit)?)?\/?$/,
  );
  if (!match) return undefined;
  const caseLink = { label: "Case", href: `/safety/${match[1]}` };

  const page = SAFETY_PAGES.find((item) => item.segment === match[2]);
  if (!page) return caseLink;
  const link = {
    label: page.label,
    href: `/safety/${match[1]}/${page.segment}`,
  };
  if (!page.detail || !match[3]) return { ...caseLink, children: [link] };
  // Editing a record hangs "Edit" where the record would be: one child,
  // so the menu does not grow a further level for a form.
  const label = match[4] ? "Edit" : page.detail;
  return {
    ...caseLink,
    children: [{ ...link, children: [{ label, href: pathname }] }],
  };
}

/**
 * Settings pages open to everybody, each shown as a child of Settings
 * while open.
 */
const SETTINGS_PAGES: readonly NavItem[] = [
  { label: "Account", href: "/settings/account" },
  { label: "Two-factor setup", href: "/settings/totp" },
];

/**
 * Settings pages that sit inside the passport's gates, shown the same
 * way to a holder.
 */
const PASSPORT_SETTINGS_PAGES: readonly NavItem[] = [
  { label: "CPD date ranges", href: "/settings/cpd-date-ranges" },
];

/**
 * The feature entries this user may see, in the order they appear.
 *
 * Every hook is called unconditionally and the results combined
 * afterwards. Gating one hook on another with `&&` would short-circuit
 * it, changing the number of hooks React sees between renders as a
 * feature flag loads.
 */
export function useFeatureNavItems(): NavItem[] {
  // Each link advertises exactly what its route requires. An entry
  // whose gate is looser than its route's leads to a 404, which is a
  // worse experience than not offering the link at all.
  // Either opens `/admin`, matching its route guard: a scoped manager
  // such as `manage_teaching` reaches the part of it that is theirs.
  const hasAdminAccess = useHasAnyCompetency(
    "manage_users",
    ...SCOPED_MANAGER_IDS,
  );

  // Where the user is, so the passport entry can hang the page that is
  // open beneath it. See the comment on those children.
  const { pathname } = useLocation();

  // Teaching is gated as the passport is, on the organisation feature
  // and the competency that opens it, matching its routes and the API.
  const teachingEnabled = useHasFeature("teaching");
  const canSeeResults = useHasCompetency("view_teaching_results");
  const hasTeaching = teachingEnabled && canSeeResults;

  // Safety is gated as the passport is, on the organisation feature and
  // the competency its professions carry, matching its routes.
  const safetyEnabled = useHasFeature("safety");
  const canViewSafety = useHasCompetency("view_safety_cases");
  const hasSafety = safetyEnabled && canViewSafety;

  // The passport routes carry RequireFeature *and* RequireCompetency,
  // so both are asked here.
  // A holder with no org_unit that has the passport still reaches their
  // own record, so they are offered the way in too.
  const passportEnabled = useCanReachPassport();
  const canAssess = useHasCompetency("assess_clinician_passport");
  const canWrite = useHasCompetency("passport_write");
  const hasPassport = passportEnabled && canAssess;

  // Somebody who can only assess has no passport of their own and no
  // way to start one, so `/passport` would greet them with an offer to
  // create one. What they come for is the requests naming them, which
  // are listed in the inbox with everything else waiting on them, so
  // their link goes straight there. It is also where they land at `/`.
  //
  // Holding `passport_write` as well means the holder's own record is
  // the right landing place, whether or not they have created it yet.
  const assessesOnly = canAssess && !canWrite;

  const items: NavItem[] = [];

  if (hasTeaching) {
    // No children here, deliberately. What hangs under Teaching differs
    // by where you are: the main sidebar offers an educator the
    // Assessments and Manage items pages, while inside teaching the
    // useful child is the module being worked on. Putting either here
    // gives it to both, which is how teaching pages briefly grew an
    // Assessments sub-link they had never had.
    items.push({
      label: "Teaching",
      href: "/teaching",
      icon: "teaching",
    });
  }

  if (hasPassport) {
    const openPage = passportPageAt(pathname);
    items.push({
      label: assessesOnly ? "Sign-off requests" : "Passport",
      href: assessesOnly ? INBOX_PATH : "/passport",
      icon: "passport",
      // The one passport page that is open, so the side navigation
      // says where in the passport somebody is without listing every
      // page all the time: the passport page itself links to them.
      //
      // Only for somebody with a passport of their own. An assessor
      // without one lands on the inbox, which is the whole of their
      // top-level link, so hanging the same address beneath itself
      // would offer them the page twice.
      //
      // A holder's inbox is the requests naming them as an assessor. A
      // trainee who assesses a more junior colleague is ordinary, and
      // without this child the page had no way in short of typing the
      // address.
      //
      // Attached by route rather than left to the nav to expand,
      // because `isActiveOrParent` expands a branch when the parent's
      // own address matches. That is right for Admin, where landing on
      // `/admin` should reveal what is under it, and wrong here, where
      // the passport itself is a destination rather than a heading.
      //
      // The one exception is signing somebody off, which is an
      // assessor's page whether or not they hold a passport.
      children: !assessesOnly
        ? openPage && [openPage]
        : pathname.startsWith(SIGN_OFF_PREFIX)
          ? [{ label: "Sign off", href: pathname }]
          : undefined,
    });
  }

  if (hasSafety) {
    const openPage = safetyPageAt(pathname);
    items.push({
      label: "Safety",
      href: "/safety",
      icon: "safety",
      // As under Passport: the one open page, attached by route, so the
      // navigation says which part of a case is open.
      children: openPage ? [openPage] : undefined,
    });
  }

  // As under Passport: the open page only, attached by route. The
  // passport's own settings pages are offered only to a holder, because
  // they sit inside the passport's gates.
  const openSettingsPage = [
    ...SETTINGS_PAGES,
    ...(hasPassport && !assessesOnly ? PASSPORT_SETTINGS_PAGES : []),
  ].find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  items.push({
    label: "Settings",
    href: "/settings",
    icon: "settings",
    children: openSettingsPage ? [openSettingsPage] : undefined,
  });

  if (hasAdminAccess) {
    items.push({
      label: "Admin",
      href: "/admin",
      icon: "adjustments",
    });
  }

  return items;
}
