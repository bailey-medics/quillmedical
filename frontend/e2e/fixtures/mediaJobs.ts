/**
 * Stand in for the transcode and caption jobs, as each does on finishing.
 *
 * The test stack (`compose.ci.yml`) names a transcode and a caption job
 * that nothing runs, so the media gate asks what it asks in App
 * production: a module is hidden until its video is transcoded and its
 * captions are dealt with. A test plays each job's last part: it writes
 * the job's file beside the upload, in the module's `learning/` folder the
 * stack serves video from, then reports to the job's callback, exactly as
 * the job would.
 *
 * A job proves who it is with a Google-signed identity token for the
 * backend's address. Nothing in the test stack can get one, so the stack
 * checks tokens against a key made for the run instead
 * (`.github/scripts/ci/prepare-e2e-job-key.sh`), and these are signed with
 * its private half. Everything else about the token is checked as
 * Google's are, so it names the audience and a caller `compose.ci.yml`
 * lists.
 *
 * The rendition is written into `.e2e-teaching/`, which
 * `.github/scripts/ci/fetch-e2e-teaching.sh` opens to every user, and left
 * open to every user too: the backend runs as its own user, and removes
 * it when the video is deleted.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext } from "@playwright/test";
import { MODULE_ID } from "./answers";

/** The address a job's token names, as `compose.ci.yml` sets it. */
const AUDIENCE = "https://quill-ci.invalid";

/** The transcode job's account, one of the callers `compose.ci.yml` lists. */
const TRANSCODE_JOB = "transcode-job@quill-ci.iam.gserviceaccount.com";

/** The caption job's account, the other. */
const CAPTION_JOB = "caption-job@quill-ci.iam.gserviceaccount.com";

/** The run's private key, from the `frontend` folder tests run in. */
const JOB_KEY = path.join("e2e", ".job-key", "private.pem");

/** The module's learning folder, from the `frontend` folder tests run in. */
const LEARNING = path.join(
  "..",
  ".e2e-teaching",
  "respiratory-teaching",
  "modules",
  MODULE_ID,
  "learning",
);

/** The content's own copy of the video, which the admin uploads. */
export const LUNGS_VIDEO = path.join(LEARNING, "lungs-video.mp4");

/** An upload's own file in the learning folder: its asset id, then `.mp4`. */
const UPLOAD_FILE = /^([0-9a-f]{32})\.mp4$/;

/**
 * The asset ids of the uploads in the learning folder, as the transcode
 * job finds the file it is given. The stack has no bucket, so an upload is
 * written there by the backend.
 */
export function uploadsOnDisk(): Set<string> {
  const found = new Set<string>();

  for (const name of fs.readdirSync(LEARNING)) {
    const match = UPLOAD_FILE.exec(name);
    if (match?.[1] !== undefined) {
      found.add(match[1]);
    }
  }

  return found;
}

/** Wait until an upload not among *before* is on disk, and return its id. */
export async function newUpload(before: Set<string>): Promise<string> {
  let assetId = "";

  await expect
    .poll(
      () => {
        assetId = [...uploadsOnDisk()].find((id) => !before.has(id)) ?? "";
        return assetId;
      },
      // The upload is written once all of it has arrived, which on a busy
      // runner takes longer than the default five seconds.
      { timeout: 30_000 },
    )
    .not.toBe("");

  return assetId;
}

/** One upload, as the callbacks address it. */
export interface Upload {
  /** The organisation's media prefix: for an org_unit made since, its id. */
  orgId: number;
  assetId: string;
}

/** Base64url, as a token's three parts are written. */
function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

/**
 * An identity token for *email*, shaped as Google's and signed by the run.
 * `scanJob.ts` signs the malware scan's reports with it too.
 */
export function identityToken(email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: AUDIENCE,
      email,
      email_verified: true,
      iat: now,
      exp: now + 300,
    }),
  );
  const signature = crypto.sign(
    "sha256",
    Buffer.from(`${header}.${claims}`),
    fs.readFileSync(JOB_KEY, "utf8"),
  );

  return `${header}.${claims}.${base64url(signature)}`;
}

/** Report to one of the callbacks as *job*, failing on anything but 200. */
async function report(
  request: APIRequestContext,
  job: string,
  callback: string,
  data: unknown,
): Promise<void> {
  const response = await request.post(`/api/ci/teaching/${callback}`, {
    headers: { Authorization: `Bearer ${identityToken(job)}` },
    data,
  });

  expect(response.status(), await response.text()).toBe(200);
}

/**
 * Finish the transcode: write the 720p rendition the player asks for, and
 * report it. The report also asks for captions, as the real one does.
 */
export async function finishTranscode(
  request: APIRequestContext,
  upload: Upload,
): Promise<void> {
  const rendition = path.join(LEARNING, `${upload.assetId}-720p.mp4`);
  fs.copyFileSync(LUNGS_VIDEO, rendition);
  fs.chmodSync(rendition, 0o666);

  await report(request, TRANSCODE_JOB, "transcode-complete", {
    org_id: upload.orgId,
    module_id: MODULE_ID,
    asset_id: upload.assetId,
    outputs: [path.basename(rendition)],
  });
}

/**
 * Finish the captions of a silent video: the job finds no speech, writes
 * no captions, and says so. `lungs-video.mp4` has no audio track.
 */
export async function finishWithNoSpeech(
  request: APIRequestContext,
  upload: Upload,
): Promise<void> {
  await report(request, CAPTION_JOB, "no-speech", {
    org_id: upload.orgId,
    module_id: MODULE_ID,
    asset_id: upload.assetId,
  });
}
