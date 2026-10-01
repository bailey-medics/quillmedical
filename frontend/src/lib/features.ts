import { useAuth } from "@/auth/AuthContext";

/**
 * Check whether the current user's organisation has a feature enabled.
 *
 * @param key - Feature key (e.g. "teaching", "epr", "messaging")
 * @returns `true` when the feature is present in `enabled_features`
 */
export function useHasFeature(key: string): boolean {
  const { state } = useAuth();
  if (state.status !== "authenticated") return false;
  return state.user.enabled_features?.includes(key) ?? false;
}

/**
 * Whether the current user may open the passport pages at all.
 *
 * True when the passport feature reaches them, as for any feature. Also
 * true for somebody who holds a passport of their own and belongs
 * nowhere it is switched on: reading and exporting your own record come
 * from owning it, never from where you work. The API then lets them
 * read and refuses every write, and reports the passport as read-only.
 *
 * @returns `true` when the passport pages should be offered
 */
export function useCanReachPassport(): boolean {
  const { state } = useAuth();
  const hasFeature = useHasFeature("passport");
  if (state.status !== "authenticated") return false;
  return hasFeature || state.user.owns_passport === true;
}
