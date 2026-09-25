/**
 * The committed email renders, for the Foundations/Emails stories
 *
 * The backend renders every email with sample values into `rendered/`
 * (`just email-preview`), with an `index.json` holding the inbox line each
 * shows above its email. `backend/tests/test_email_previews.py` fails when
 * the templates change and the renders are not updated, so what Storybook
 * shows is what the backend sends.
 */

import index from "./rendered/index.json";

export type EmailThemeName = "quill" | "ldd";

export interface RenderedEmailEntry {
  file: string;
  subject: string;
  preheader: string;
  fromName: string;
  replyTo: string | null;
}

interface IndexEntry {
  id: string;
  label: string;
  quill: RenderedEmailEntry;
  ldd: RenderedEmailEntry;
}

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
  return {
    ...meta,
    html: dark
      ? html.replace("@media (prefers-color-scheme: dark)", "@media all")
      : html,
  };
}
