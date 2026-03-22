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
