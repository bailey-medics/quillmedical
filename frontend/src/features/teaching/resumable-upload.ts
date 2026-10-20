/**
 * Send one file to an open GCS resumable upload session, a chunk at a
 * time, carrying on from what GCS confirms when a request fails.
 *
 * The file used to go up as one `PUT`. A laptop going to sleep, a Wi-Fi
 * drop or a proxy closing a long connection then lost the whole upload,
 * however far it had got, and a lecture is hundreds of megabytes. Now a
 * failure costs at most the chunk in flight: the session is asked how
 * much it holds, and the next chunk starts there.
 *
 * GCS answers every chunk but the last with `308` and a `Range` header,
 * `bytes=0-N`, naming the bytes it has. No `Range` at all means it has
 * none yet. The browser only shows the page that header because the
 * source bucket's CORS policy exposes it. A `308` with no `Location` is
 * not followed as a redirect: the Fetch standard hands it back as it
 * is, so `XMLHttpRequest` reports the status.
 *
 * Only the session URL is used here. Opening the session, and the local
 * development route that takes one plain `PUT`, are the caller's.
 */

/**
 * How much of the file each request carries.
 *
 * GCS requires every chunk but the last to be a multiple of 256 KiB.
 * Sixteen MiB keeps the number of requests small on a large file while
 * a dropped connection loses little.
 */
export const UPLOAD_CHUNK_BYTES = 16 * 1024 * 1024;

/**
 * How long to wait before each retry, in order.
 *
 * Six tries, doubling to half a minute, so a blip of under a minute is
 * ridden out. The count starts again whenever GCS accepts more bytes,
 * so a long upload survives several short blips rather than one.
 */
export const UPLOAD_RETRY_DELAYS_MS: readonly number[] = [
  1_000, 2_000, 4_000, 8_000, 16_000, 30_000,
];

/**
 * Why an upload stopped.
 *
 * - `connection`: the network failed, or GCS kept answering with a
 *   server error, until the retries ran out.
 * - `session-gone`: GCS no longer knows the session (`404` or `410`).
 *   Sessions last a week, so this is an upload left for very long.
 * - `refused`: GCS answered with a status that retrying will not change.
 */
export type UploadFailureKind = "connection" | "session-gone" | "refused";

/** An upload that stopped, with the status GCS last gave, if any. */
export class UploadFailure extends Error {
  readonly kind: UploadFailureKind;
  readonly status: number | null;

  constructor(kind: UploadFailureKind, status: number | null) {
    super(`Upload stopped: ${kind}${status === null ? "" : ` (${status})`}`);
    this.name = "UploadFailure";
    this.kind = kind;
    this.status = status;
  }
}

export interface ResumableUploadOptions {
  /** Whole percent of the file GCS holds or is receiving. Never falls. */
  onProgress: (percent: number) => void;
  /** True while waiting to try again after a failure, false once moving. */
  onRetrying?: (retrying: boolean) => void;
  chunkBytes?: number;
  retryDelaysMs?: readonly number[];
  /** Overridable so a test need not wait real seconds. */
  wait?: (ms: number) => Promise<void>;
  /** Resolves once the browser thinks it is online. */
  waitForOnline?: () => Promise<void>;
}

/** What one request to the session came back with. */
interface SessionAnswer {
  /** Null when the request never got an answer: the network failed. */
  status: number | null;
  range: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for the browser to come back online, if it has gone offline.
 *
 * Retrying while offline only spends the retries, so a laptop that has
 * just woken waits for its network rather than giving up on it.
 */
function untilOnline(): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.addEventListener("online", () => resolve(), { once: true });
  });
}

/**
 * The first byte GCS does not yet hold, from its `Range` header.
 *
 * `bytes=0-N` means it holds N + 1 bytes. No header means it holds
 * none. Anything unreadable is treated as none, which costs a resend
 * rather than a corrupt file.
 */
export function confirmedOffset(range: string | null): number {
  if (!range) return 0;

  const match = /^bytes=0-(\d+)$/.exec(range.trim());
  if (!match) return 0;

  return Number(match[1]) + 1;
}

/** A status worth trying again: the network, a timeout, a busy server. */
function isRetryable(status: number | null): boolean {
  return status === null || status === 408 || status === 429 || status >= 500;
}

/**
 * One `PUT` to the session.
 *
 * With a chunk, it sends bytes `start` to `end - 1`. Without one, it
 * sends no body and a `Content-Range` naming only the total, which asks
 * how many bytes the session holds. That is how GCS is asked after a
 * failure, and it is also how an empty file is finished.
 */
function putToSession(
  sessionUrl: string,
  file: File,
  chunk: { start: number; end: number } | null,
  onLoaded: (loaded: number) => void,
): Promise<SessionAnswer> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", sessionUrl);

    if (chunk === null) {
      request.setRequestHeader("Content-Range", `bytes */${file.size}`);
    } else {
      request.setRequestHeader("Content-Type", file.type);
      request.setRequestHeader(
        "Content-Range",
        `bytes ${chunk.start}-${chunk.end - 1}/${file.size}`,
      );
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onLoaded(event.loaded);
      });
    }

    request.addEventListener("load", () =>
      resolve({
        status: request.status,
        range: request.getResponseHeader("Range"),
      }),
    );
    // A dropped connection, a sleeping laptop, a blocked request: no
    // answer at all, which is what a null status means.
    request.addEventListener("error", () =>
      resolve({ status: null, range: null }),
    );
    request.addEventListener("abort", () =>
      resolve({ status: null, range: null }),
    );

    request.send(chunk === null ? null : file.slice(chunk.start, chunk.end));
  });
}

/**
 * Send *file* to *sessionUrl* in chunks, resuming after failures.
 *
 * Resolves once GCS says the object is complete. Rejects with an
 * {@link UploadFailure} once the retries run out, the session has gone,
 * or GCS refuses outright.
 */
export async function uploadResumable(
  sessionUrl: string,
  file: File,
  options: ResumableUploadOptions,
): Promise<void> {
  const chunkBytes = options.chunkBytes ?? UPLOAD_CHUNK_BYTES;
  const delays = options.retryDelaysMs ?? UPLOAD_RETRY_DELAYS_MS;
  const wait = options.wait ?? sleep;
  const waitForOnline = options.waitForOnline ?? untilOnline;
  const onRetrying = options.onRetrying ?? (() => undefined);

  if (chunkBytes <= 0 || chunkBytes % (256 * 1024) !== 0) {
    throw new Error("Chunk size must be a positive multiple of 256 KiB");
  }

  const total = file.size;
  let offset = 0;
  let failures = 0;
  // An empty file has no chunk to send. Naming only the total finishes
  // it, and a Content-Range of bytes 0 to -1 would be refused.
  let asking = total === 0;
  let shown = 0;

  // Progress is only ever raised. A retry restarts from what GCS holds,
  // which can be behind what was sent, and a bar going backwards reads
  // as the upload breaking when it is the upload recovering.
  const report = (bytes: number) => {
    const percent = total === 0 ? 100 : Math.floor((bytes / total) * 100);
    if (percent > shown) {
      shown = percent;
      options.onProgress(percent);
    }
  };

  for (;;) {
    const end = Math.min(offset + chunkBytes, total);
    const chunkStart = offset;
    const answer = await putToSession(
      sessionUrl,
      file,
      asking ? null : { start: chunkStart, end },
      (loaded) => report(chunkStart + loaded),
    );
    asking = false;

    if (answer.status === 200 || answer.status === 201) {
      onRetrying(false);
      report(total);
      return;
    }

    if (answer.status === 308) {
      const held = confirmedOffset(answer.range);

      // More bytes than before is the only thing that counts as getting
      // somewhere, so it is the only thing that resets the retries.
      if (held > offset) failures = 0;
      offset = held;
      onRetrying(false);
      report(offset);
      continue;
    }

    if (answer.status === 404 || answer.status === 410) {
      throw new UploadFailure("session-gone", answer.status);
    }

    if (!isRetryable(answer.status)) {
      throw new UploadFailure("refused", answer.status);
    }

    if (failures >= delays.length) {
      throw new UploadFailure("connection", answer.status);
    }

    onRetrying(true);
    await waitForOnline();
    await wait(delays[failures]);
    failures += 1;

    // Ask before sending again: GCS may hold more, or less, than the
    // chunk that failed suggests.
    asking = true;
  }
}
