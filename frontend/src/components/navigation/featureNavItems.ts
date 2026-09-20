/**
 * Cross-feature navigation entries.
 *
 * The one place that decides which features appear in the sidebar. Both
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

import { useHasFeature } from "@/lib/features";
import { useHasCompetency } from "@/lib/cbac/hooks";
import type { NavItem } from "./NestedNavLink";

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

  const hasTeaching = useHasFeature("teaching");

  // The passport routes carry RequireFeature *and* RequireCompetency,
  // so both are asked here. Teaching gates its entry on the feature
  // alone, matching its own routes.
  const passportEnabled = useHasFeature("passport");
  const canUsePassport = useHasCompetency("access_clinician_passport");
  const hasPassport = passportEnabled && canUsePassport;

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
    items.push({
      label: "Passport",
      href: "/passport",
      icon: "passport",
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
