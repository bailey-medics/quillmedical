/**
 * Which guides somebody is shown.
 *
 * **This filters for relevance. It is not access control**, and nothing
 * should lean on it as a guard. A guide to adding a delegate is not a
 * secret: the page it describes has its own guard, and the API refuses
 * the action. That is why the whole thing lives in the browser, with no
 * endpoint and no table behind it.
 *
 * The ladder (`delegate`, `admin`, `superadmin`) belongs to the guides and
 * is not borrowed from the permission checks, because the real layers are
 * not a ladder. Somebody who operates Quill does not necessarily hold
 * `manage_teaching`, and would otherwise be shown fewer guides than an
 * admin. See `docs/docs/plans/2026-10-05-in-app-guides-plan.md`.
 */

import { useAuth, type User } from "@/auth/AuthContext";
import {
  GUIDE_AUDIENCES,
  GUIDES,
  type Guide,
  type GuideAudience,
} from "@/guides/registry";
import { SCOPED_MANAGER_IDS } from "@/types/cbac";

/** The competencies that open `/admin`, as its route guard has them. */
const ADMIN_COMPETENCIES: readonly string[] = [
  "manage_users",
  ...SCOPED_MANAGER_IDS,
];

/** The highest audience this person reads as. */
export function guideTierOf(user: User): GuideAudience {
  if (user.platform_role === "superadmin") return "superadmin";
  const held = user.competencies ?? [];
  if (ADMIN_COMPETENCIES.some((competency) => held.includes(competency))) {
    return "admin";
  }
  return "everyone";
}

/**
 * Whether a feature's guides reach this person. As the feature itself
 * does, with one exception the side navigation makes too: somebody who
 * holds a passport of their own may read and export it wherever they
 * work, so its guides follow them.
 */
function reachesFeature(user: User, feature: string): boolean {
  if ((user.enabled_features ?? []).includes(feature)) return true;
  return feature === "passport" && user.owns_passport === true;
}

/**
 * The guides this person is shown: those at or below their tier, less any
 * that belong to a feature that does not reach them or that ask for a
 * competency they do not hold. An operator is not asked for the
 * competency: they are shown round everything their deployment has.
 * `guides` is every guide there is unless a test says otherwise.
 */
export function guidesVisibleTo(
  user: User,
  guides: readonly Guide[] = GUIDES,
): Guide[] {
  const reader = guideTierOf(user);
  const tier = GUIDE_AUDIENCES.indexOf(reader);
  const held: readonly string[] = user.competencies ?? [];
  return guides.filter(
    (guide) =>
      GUIDE_AUDIENCES.indexOf(guide.audience) <= tier &&
      (guide.feature === undefined || reachesFeature(user, guide.feature)) &&
      (guide.competency === undefined ||
        reader === "superadmin" ||
        held.includes(guide.competency)),
  );
}

/**
 * The guides anybody may read without signing in, such as how to join.
 * A reader has to be able to find out how to get an account before they
 * have one.
 */
export function publicGuides(guides: readonly Guide[] = GUIDES): Guide[] {
  return guides.filter((guide) => guide.public);
}

/** The signed-in reader's tier, or null for somebody not signed in. */
export function useGuideTier(): GuideAudience | null {
  const { state } = useAuth();
  return state.status === "authenticated" ? guideTierOf(state.user) : null;
}

/** The guides the signed-in reader is shown. None when not signed in. */
export function useVisibleGuides(): Guide[] {
  const { state } = useAuth();
  return state.status === "authenticated" ? guidesVisibleTo(state.user) : [];
}

/**
 * The guide at this slug, if this reader may be shown it: one of their
 * own when signed in, a public one when not. Nothing while the session
 * is still being checked, so a signed-in reader is never shown the 404
 * for a moment on the way to their guide.
 */
export function useReadableGuide(slug: string | undefined): Guide | undefined {
  const { state } = useAuth();
  if (state.status === "loading") return undefined;
  const guides =
    state.status === "authenticated"
      ? guidesVisibleTo(state.user)
      : publicGuides();
  return guides.find((guide) => guide.slug === slug);
}
