/**
 * Read the emails the end-to-end stack sent.
 *
 * The stack sends nothing for real. With `EMAIL_CAPTURE_DIR` set, the
 * backend writes each email it would have sent to `e2e/.mail/` as one
 * JSON file, which `compose.ci.yml` mounts and
 * `.github/scripts/ci/prepare-e2e-mail.sh` makes writable. File names
 * sort in the order the emails were sent.
 *
 * Every test sends to an address it has just made, so the newest email
 * to that address is the one it is waiting for.
 */

import fs from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";

/** One email, as the backend wrote it. */
export interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  text: string | null;
}

/** Where the stack writes them, from the `frontend` folder Playwright runs in. */
const MAIL_FOLDER = path.join("e2e", ".mail");

function isCapturedEmail(value: unknown): value is CapturedEmail {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const email = value as Record<string, unknown>;

  return (
    typeof email.to === "string" &&
    typeof email.subject === "string" &&
    typeof email.html === "string"
  );
}

/** Every email sent to *to* so far, oldest first. */
function emailsTo(to: string): CapturedEmail[] {
  if (!fs.existsSync(MAIL_FOLDER)) {
    return [];
  }

  const found: CapturedEmail[] = [];

  for (const name of fs.readdirSync(MAIL_FOLDER).sort()) {
    if (!name.endsWith(".json")) {
      continue;
    }

    const parsed: unknown = JSON.parse(
      fs.readFileSync(path.join(MAIL_FOLDER, name), "utf8"),
    );
    if (isCapturedEmail(parsed) && parsed.to === to) {
      found.push(parsed);
    }
  }

  return found;
}

/**
 * Wait for an email to *to* and return the newest.
 *
 * Fails, naming the address, if none comes within the timeout.
 */
export async function waitForEmail(
  to: string,
  timeout = 15_000,
): Promise<CapturedEmail> {
  await expect
    .poll(() => emailsTo(to).length, {
      message: `No email was sent to ${to}`,
      timeout,
    })
    .toBeGreaterThan(0);

  const emails = emailsTo(to);

  return emails[emails.length - 1];
}

/**
 * Wait for an email to *to* that *matches*, and return the newest such.
 *
 * For an address several tests send to at once, such as a clinical
 * lead's, where the newest email may be another test's.
 */
export async function waitForEmailMatching(
  to: string,
  matches: (email: CapturedEmail) => boolean,
  timeout = 15_000,
): Promise<CapturedEmail> {
  await expect
    .poll(() => emailsTo(to).filter(matches).length, {
      message: `No matching email was sent to ${to}`,
      timeout,
    })
    .toBeGreaterThan(0);

  const found = emailsTo(to).filter(matches);

  return found[found.length - 1];
}

/** How many emails have been sent to *to* so far. */
export function emailCount(to: string): number {
  return emailsTo(to).length;
}

/**
 * Check no more email reaches *to* within *wait* milliseconds, than the
 * *before* it had already been sent.
 *
 * For an email that must not be sent. It waits the whole time, since a
 * check made at once would pass before a slow send had happened.
 */
export async function expectNoNewEmail(
  to: string,
  before: number,
  wait = 5_000,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, wait));

  const after = emailsTo(to);
  expect(
    after.slice(before).map((email) => email.subject),
    `An email was sent to ${to}`,
  ).toEqual([]);
}

/**
 * The first link in an email whose address contains *contains*.
 *
 * Read from the HTML, which is what a person clicks. Returned as a path
 * and query, without the site's address: the backend builds links from
 * its own idea of where the app is, which is not the free port a local
 * run is on.
 */
export function linkIn(email: CapturedEmail, contains: string): string {
  const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((match) =>
    match[1].replaceAll("&amp;", "&"),
  );
  const href = hrefs.find((candidate) => candidate.includes(contains));

  if (href === undefined) {
    throw new Error(`No link containing ${contains} in "${email.subject}"`);
  }

  const url = new URL(href, "http://localhost");

  return `${url.pathname}${url.search}`;
}
