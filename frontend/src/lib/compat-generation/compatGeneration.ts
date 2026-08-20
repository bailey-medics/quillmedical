/**
 * compatGeneration
 *
 * Client-side half of the API-compatibility forced-reload mechanism (see
 * docs/docs/backend/api-compatibility.md and
 * docs/docs/plans/2026-08-09-sub-plan-api-compatibility-plan.md). Pure
 * comparison logic plus a tiny module-level "reload pending" flag — no
 * React here, so it's usable from both `lib/api.ts` (the response
 * interceptor) and `ForcedReloadGate` (the React orchestrator).
 *
 * `CLIENT_COMPAT_GENERATION` is this bundle's own generation, baked in at
 * build time via Vite `define` (see vite.config.ts). The backend serves
 * its own current value on every response via the `Compat-Generation`
 * header. Comparing the two tells a tab whether it's still compatible.
 */

/** This bundle's own generation, baked in at build time. */
export const CLIENT_COMPAT_GENERATION: number = __COMPAT_GENERATION__;

export const COMPAT_GENERATION_HEADER = "Compat-Generation";

/** Dispatched on `window` the moment a client-behind mismatch is first detected. */
export const COMPAT_MISMATCH_EVENT = "app:compat-mismatch";

export type CompatCheckResult =
  | "compatible"
  | "client-behind"
  | "server-behind"
  | "unknown";

/**
 * Compares this bundle's baked-in generation against the server's served
 * header value. Never infers incompatibility from a missing or
 * non-numeric header — that is always "unknown", not "client-behind".
 */
export function checkCompatGeneration(
  clientGeneration: number,
  serverHeaderValue: string | null,
): CompatCheckResult {
  if (serverHeaderValue === null || serverHeaderValue.trim() === "") {
    return "unknown";
  }

  const serverGeneration = Number(serverHeaderValue);
  if (!Number.isInteger(serverGeneration)) return "unknown";

  if (clientGeneration === serverGeneration) return "compatible";
  // Backend momentarily behind (rolling deploy) — never act on this.
  if (clientGeneration > serverGeneration) return "server-behind";
  return "client-behind";
}

let reloadPending = false;

/** True once a client-behind mismatch has been detected this session. */
export function isReloadPending(): boolean {
  return reloadPending;
}

/** Marks a forced reload as pending — further mutating requests are blocked. */
export function markReloadPending(): void {
  reloadPending = true;
}

/** Test-only reset of the module-level pending flag. */
export function _resetReloadPendingForTests(): void {
  reloadPending = false;
}
