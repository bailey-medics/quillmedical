export default function getAssetPath(path: string): string {
  // Vite injects import.meta.env.BASE_URL (usually ends with a slash).
  // If not present (Storybook or other envs), fall back to '/'.
  const base = (import.meta.env && (import.meta.env.BASE_URL as string)) || "/";
  const normalizedBase = base.endsWith("/") ? base : base + "/";
  // Remove leading slash from provided path to avoid double slashes.
  const normalizedPath = path.replace(/^\//, "");
  return `${normalizedBase}${normalizedPath}`;
}
