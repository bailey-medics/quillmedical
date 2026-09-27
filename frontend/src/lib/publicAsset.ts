/**
 * publicAsset
 *
 * Resolves a file in `frontend/public` against Vite's base URL.
 *
 * The app is built with `base: "/"`, so a path comes back unchanged there.
 * The published Storybook is built with a relative base (`./`) and served
 * under a sub-path, where a root-absolute `/quill-logo.png` would point at
 * the site root and 404. Routing every public asset through this function
 * makes the same path work in both.
 *
 * @param path - The asset path within `public`, with or without a leading `/`
 * @returns The path prefixed with the base URL
 */
export function publicAsset(path: string): string {
  const rawBase = (import.meta.env.BASE_URL as string | undefined) || "/";
  const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
  return `${base}${path.replace(/^\/+/, "")}`;
}

export default publicAsset;
