/**
 * The loader for each feature's one lazy chunk.
 *
 * A feature is a single `import()` target, so Rollup cuts a single chunk
 * for it. Routes in `main.tsx` pass these to `lazyFrom`; nothing else
 * should import a feature's chunk module, statically or otherwise, or the
 * pages are pulled back into first load. See
 * `docs/docs/plans/2026-10-04-lazy-load-one-chunk-per-feature-plan.md`.
 */

export const loadAdmin = () => import("./pages/admin/adminChunk");
export const loadClinical = () => import("./pages/clinical/clinicalChunk");
export const loadPassport = () => import("./pages/passport/passportChunk");
export const loadSafety = () => import("./pages/safety/safetyChunk");
