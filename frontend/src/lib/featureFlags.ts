/**
 * In-code app feature flags.
 *
 * These are intentionally separate from:
 * 1) organisation feature switches (`enabled_features` in auth state), and
 * 2) Vite environment variables.
 */
export const appFeatureFlags = {
  /**
   * Controls visibility of notifications ActionCard on Settings page.
   */
  settingsNotificationsCardEnabled: false,
} as const;
