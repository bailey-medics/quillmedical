/**
 * The committed email renders, for the Foundations/Emails stories
 *
 * The backend renders every email with sample values into `rendered/`
 * (`just email-preview`), with an `index.json` holding the inbox line each
 * shows above its email. `backend/tests/test_email_previews.py` fails when
 * the templates change and the renders are not updated, so what Storybook
 * shows is what the backend sends.
 */

import type { EmailThemeName } from "@/generated/emailThemes";
import publicAsset from "@lib/publicAsset";
import index from "./rendered/index.json";

export type { EmailThemeName };

export interface RenderedEmailEntry {
  file: string;
  subject: string;
  preheader: string;
  fromName: string;
  replyTo: string | null;
}

/** One preview: its id and label, and a render for each theme. */
type IndexEntry = { id: string; label: string } & Record<
  EmailThemeName,
  RenderedEmailEntry
>;

const renders = import.meta.glob<string>("./rendered/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
});

const entries: IndexEntry[] = index;

/** Every preview id, in the order the backend lists them. */
export const emailIds: string[] = entries.map((entry) => entry.id);

/** What each preview is called in the story's control. */
export const emailLabels: Record<string, string> = Object.fromEntries(
  entries.map((entry) => [entry.id, entry.label]),
);

export interface RenderedEmail extends RenderedEmailEntry {
  html: string;
}

/**
 * One rendered email.
 *
 * `dark` rewrites the email's `prefers-color-scheme: dark` query to always
 * apply, so the preview shows what a mail client in dark mode shows,
 * whatever the viewer's own setting.
 *
 * The renders point their images at the site root (`/email/...`), which is
 * right for a sent email but not for the published Storybook under a
 * sub-path, so each `src` is resolved through `publicAsset`.
 */
export function renderedEmail(
  id: string,
  theme: EmailThemeName,
  dark = false,
): RenderedEmail {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`No rendered email "${id}". Run just email-preview.`);
  }
  const meta = entry[theme];
  const html = renders[`./rendered/${meta.file}`];
  if (html === undefined) {
    throw new Error(`Missing render ${meta.file}. Run just email-preview.`);
  }
  const withAssets = html.replace(
    /src="(\/[^"]*)"/g,
    (_match, path: string) => `src="${publicAsset(path)}"`,
  );
  return {
    ...meta,
    html: dark
      ? withAssets.replace("@media (prefers-color-scheme: dark)", "@media all")
      : withAssets,
  };
}
