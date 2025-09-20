/**
 * urlUpdate
 *
 * Normalizes a static asset URL depending on the current runtime environment.
 *
 * Motivation
 * - In Storybook and some static preview environments assets are served from the
 *   project root (e.g. `/quill-logo.png`). In the SPA (production or dev served
 *   as an app) assets are mounted under an application prefix (`/app`).
 * - `urlUpdate` encapsulates the heuristic rules used by the frontend to decide
 *   whether to prefix incoming asset paths with `/app` or leave them as-is so
 *   the same component code can run unchanged in Storybook, static pages, and
 *   the production SPA.
 *
 * Behavior
 * - If running inside Storybook (detected via `import.meta.env.STORYBOOK`,
 *   `import.meta.env.VITE_STORYBOOK`, or the runtime `window.__STORYBOOK_CLIENT_API__`)
 *   the original `url` is returned unchanged.
 * - As a fallback, a heuristic check for Storybook's common dev server port
 *   (`6006`) is performed and, if matched, the original `url` is returned.
 * - Otherwise `/app` is prepended to the provided `url` and the updated path is
 *   returned.
 *
 * Example
 * ```ts
 * urlUpdate('/quill-logo.png') // -> '/quill-logo.png' when inside Storybook
 * urlUpdate('/quill-logo.png') // -> '/app/quill-logo.png' when running as SPA
 * ```
 *
 * Edge cases and notes
 * - `import.meta.env` is implementation-dependent; reading it is wrapped in a
 *   try/catch to avoid runtime errors in non-Vite environments.
 * - The port/hostname check is a heuristic and only detects the common
 *   Storybook default (`6006`). Local setups on different ports won't be
 *   detected by the port rule — prefer setting an environment flag when
 *   possible (e.g. `STORYBOOK=true` or `VITE_STORYBOOK=true`).
 * - The function is intentionally conservative: false negatives (not detecting
 *   Storybook) result in prepending `/app`, which matches the SPA hosting
 *   structure used by the application.
 *
 * @param url - The asset path to normalize (should start with `/`)
 * @returns The normalized asset path appropriate for the current runtime
 */
export function urlUpdate(url: string): string {
  try {
    // Some projects expose STORYBOOK or VITE_STORYBOOK at build time via import.meta.env
    // Use a loose any type here since import.meta.env shape can vary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env: any = import.meta.env;
    if (env && (env.STORYBOOK || env.VITE_STORYBOOK)) {
      return url;
    }
  } catch {
    // ignore
  }

  if (typeof window !== "undefined") {
    const w = window as unknown as Record<string, unknown>;
    if (w.__STORYBOOK_CLIENT_API__) return url;

    try {
      const loc = window.location;
      if (
        loc &&
        (loc.port === "6006" || (loc.hostname === "localhost" && loc.port))
      ) {
        if (loc.port === "6006") return url;
      }
    } catch {
      // ignore
    }
  }

  return `/app${url}`;
}

export default urlUpdate;
