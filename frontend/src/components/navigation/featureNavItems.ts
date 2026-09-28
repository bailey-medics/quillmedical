/**
 * Cross-feature navigation entries.
 *
 * The one org_unit that decides which features appear in the sidebar. Both
 * the main sidebar and the teaching one render what this returns, so a
 * feature added here shows up in both — and, more to the point, cannot
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
 * What does *not* belong here is anything contextual — the patient
 * breadcrumb, the clinical Home and Messages links, teaching's current
 * module. Those depend on where the user is rather than on what the
 * app offers, so they stay with the sidebar that knows about them.
 */

import { useLocation } from "react-router-dom";

import { useHasFeature } from "@/lib/features";
import { useHasCompetency } from "@/lib/cbac/hooks";
import type { NavItem } from "./NestedNavLink";

/**
 * The passport's own pages, each shown as a child of Passport while it is
 * open. Named as the side navigation should say them, which is shorter
 * than some page titles: "CPD" rather than "Continuing professional
 * development".
 *
 * A page with a `detail` label also has pages of one record beneath it,
 * a single CPD activity or logbook entry. On one of those the section's
 * link gains a child of its own, so the navigation reads Passport, CPD,
 * Activity rather than stopping at CPD.
 */
const PASSPORT_PAGES: readonly (NavItem & { detail?: string })[] = [
  { label: "Sign-offs", href: "/passport/sign-offs" },
  { label: "Logbook", href: "/passport/logbook", detail: "Entry" },
  { label: "CPD", href: "/passport/cpd", detail: "Activity" },
  { label: "Certificates", href: "/passport/certificates" },
  { label: "Reflections", href: "/passport/reflections" },
  { label: "Download", href: "/passport/download" },
  { label: "Inbox", href: "/passport/inbox" },
];

/**
 * The passport page this address is, or sits beneath, if any, with the
 * record's own link beneath it on the page of one record.
 */
function passportPageAt(pathname: string): NavItem | undefined {
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
  const hasAdminAccess = useHasCompetency("manage_users");

  // Where the user is, so the passport entry can hang the page that is
  // open beneath it. See the comment on those children.
  const { pathname } = useLocation();

  const hasTeaching = useHasFeature("teaching");

  // The passport routes carry RequireFeature *and* RequireCompetency,
  // so both are asked here. Teaching gates its entry on the feature
  // alone, matching its own routes.
  const passportEnabled = useHasFeature("passport");
  const canAssess = useHasCompetency("assess_clinician_passport");
  const canWrite = useHasCompetency("passport_write");
  const hasPassport = passportEnabled && canAssess;

  // Somebody who can only assess has no passport of their own and no
  // way to start one, so `/passport` would greet them with an offer to
  // create one and hide the sign-off queue behind a button in the
  // corner. Their one page is the queue, so the link goes straight
  // there.
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
      href: assessesOnly ? "/passport/inbox" : "/passport",
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
      children: !assessesOnly && openPage ? [openPage] : undefined,
    });
  }

  items.push({
    label: "Settings",
    href: "/settings",
    icon: "settings",
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
