/**
 * The loader for each feature's one lazy chunk, and who may open it.
 *
 * A feature is a single `import()` target, so Rollup cuts a single chunk
 * for it. Routes in `main.tsx` pass these to `lazyFrom`; nothing else
 * should import a feature's chunk module, statically or otherwise, or the
 * pages are pulled back into first load. See
 * `docs/docs/plans/2026-10-04-lazy-load-one-chunk-per-feature-plan.md`.
 */

import type { User } from "./auth/AuthContext";
import type { PrefetchChunk } from "@lib/prefetchFeatures";
import { SCOPED_MANAGER_IDS } from "@/types/cbac";

export const loadAdmin = () => import("./pages/admin/adminChunk");
export const loadClinical = () => import("./pages/clinical/clinicalChunk");
export const loadPassport = () => import("./pages/passport/passportChunk");
export const loadSafety = () => import("./pages/safety/safetyChunk");
export const loadTeaching = () => import("./features/teaching/teachingChunk");

function hasFeature(user: User, feature: string): boolean {
  return user.enabled_features?.includes(feature) ?? false;
}

function hasCompetency(user: User, ...competencies: string[]): boolean {
  const held: readonly string[] = user.competencies ?? [];
  return competencies.some((competency) => held.includes(competency));
}

/**
 * Every feature chunk with the test for who may open it, in the order
 * they are fetched in the background (see `lib/prefetchFeatures.ts`).
 *
 * Each `canOpen` mirrors the guard on that feature's routes in `main.tsx`,
 * so nobody downloads a feature they cannot reach. Where a guard lets
 * somebody through on missing information, this does not: an unknown is
 * no reason to fetch. A feature added to `main.tsx` is added here.
 */
export const FEATURE_CHUNKS: readonly PrefetchChunk<User>[] = [
  {
    // <RequireFeature feature="teaching">
    name: "teaching",
    load: loadTeaching,
    canOpen: (user) => hasFeature(user, "teaching"),
  },
  {
    // <RequirePassport> then <RequireCompetency assess_clinician_passport>
    name: "passport",
    load: loadPassport,
    canOpen: (user) =>
      (hasFeature(user, "passport") || user.owns_passport === true) &&
      hasCompetency(user, "assess_clinician_passport"),
  },
  {
    // <RequireCompetency competency={["manage_users", ...SCOPED_MANAGER_IDS]}>
    name: "admin",
    load: loadAdmin,
    canOpen: (user) =>
      hasCompetency(user, "manage_users", ...SCOPED_MANAGER_IDS),
  },
  {
    // <RequireFeature feature="safety"> then <RequireCompetency view_safety_cases>
    name: "safety",
    load: loadSafety,
    canOpen: (user) =>
      hasFeature(user, "safety") && hasCompetency(user, "view_safety_cases"),
  },
  {
    // <RequireClinical>, which lets an unset flag through. This does not.
    name: "clinical",
    load: loadClinical,
    canOpen: (user) => user.clinical_services_enabled === true,
  },
];
