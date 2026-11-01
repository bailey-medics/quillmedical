/**
 * Stand in for the malware scan job, as it does on finishing.
 *
 * The test stack (`compose.ci.yml`) names a scan job that nothing runs, so
 * every passport file waits for a verdict, as in App production. A test
 * plays the job's part: it reports the verdict to the job's callback,
 * signed as `mediaJobs.ts` signs the video jobs' reports. Mark agreed on
 * 1 November 2026 that a test may do this, because it stands in for a
 * service outside Quill and not for a person on a screen. Nothing a
 * person does is ever done this way: see `.claude/rules/e2e.md`.
 *
 * The real job is told the bucket and the key of the file it scans. The
 * page never shows the key, so this asks the Cloud Storage stand-in which
 * object holds the bytes the test uploaded. A passport file's key ends in
 * the SHA-256 of its bytes, so a file made with `uniquePdf` is found
 * whatever else other tests have uploaded at the same time.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import { expect, type APIRequestContext } from "@playwright/test";
import { identityToken } from "./mediaJobs";

/** The scan job's account, one of the callers `compose.ci.yml` lists. */
const SCAN_JOB = "scan-job@quill-ci.iam.gserviceaccount.com";

/** The passports' bucket, as `compose.ci.yml` names it. */
const BUCKET = "quill-ci-passports";

/** The Cloud Storage stand-in, which `just e2e` publishes on a free port. */
const GCS_URL = process.env.E2E_GCS_URL ?? "http://localhost:4443";

/**
 * How long to wait for the page to show where a scan has got to.
 *
 * The uploader asks every three seconds (`SCAN_POLL_MS`), and a file is
 * sent to the bucket before "Scanning" shows, so the default five seconds
 * is too close to the page's own pace on a busy machine.
 */
export const SCAN_SHOWN = { timeout: 15_000 };

/** What the scan job can report. */
export type Verdict = "clean" | "infected" | "failed";

/** One object, as the stand-in lists it. */
interface ListedObject {
  name: string;
}

/**
 * A one-page PDF that no other test uploads.
 *
 * The *tag* goes in a comment after the header, so the bytes, and with
 * them the file's key, belong to one test in one browser.
 */
export function uniquePdf(tag: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n%${tag}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
      "trailer<</Root 1 0 R>>\n%%EOF\n",
  );
}

/**
 * A copy of the PDF at *pdfPath* that no other test uploads.
 *
 * The *tag* goes in a comment after the end of the file, where it moves
 * nothing the file's own index points at, so the copy draws exactly as
 * the original does.
 */
export function taggedPdf(pdfPath: string, tag: string): Buffer {
  return Buffer.concat([fs.readFileSync(pdfPath), Buffer.from(`\n%${tag}\n`)]);
}

/** The SHA-256 of *bytes*, which names the file in storage and in a zip. */
export function digestOf(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/** The key of the stored object holding *bytes*, once it is there. */
async function keyOf(
  request: APIRequestContext,
  bytes: Buffer,
): Promise<string> {
  const digest = digestOf(bytes);
  let key: string | undefined;

  await expect(async () => {
    const response = await request.get(
      `${GCS_URL}/storage/v1/b/${BUCKET}/o?prefix=passports/`,
    );
    expect(response.status(), await response.text()).toBe(200);

    const listed = (await response.json()) as { items?: ListedObject[] };
    key = listed.items?.find((item) => item.name.endsWith(`/${digest}`))?.name;
    expect(key, `no stored object ends in ${digest}`).toBeDefined();
  }).toPass({ timeout: 15_000 });

  return key as string;
}

/**
 * Report the scan of the uploaded *bytes*, as the job would, failing on
 * anything but 200.
 */
export async function reportScan(
  request: APIRequestContext,
  bytes: Buffer,
  verdict: Verdict,
  signature?: string,
): Promise<void> {
  const objectKey = await keyOf(request, bytes);
  const response = await request.post("/api/ci/uploads/scan-complete", {
    headers: { Authorization: `Bearer ${identityToken(SCAN_JOB)}` },
    data: {
      bucket: BUCKET,
      object_key: objectKey,
      verdict,
      signature: signature ?? null,
      definitions: "ClamAV stand-in",
    },
  });

  expect(response.status(), await response.text()).toBe(200);
}
