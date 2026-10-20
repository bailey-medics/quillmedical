/**
 * resumable-upload tests
 *
 * What matters is where each request starts. A chunk that starts where
 * the client thinks GCS is, rather than where GCS says it is, writes a
 * file with a hole in it, and nothing downstream would notice until a
 * learner pressed play.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  UploadFailure,
  confirmedOffset,
  uploadResumable,
} from "./resumable-upload";

/** The smallest chunk GCS accepts, so tests can use small files. */
const CHUNK = 256 * 1024;

/** One request as the fake saw it. */
interface SentRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodySize: number | null;
}

/** How the fake answers one request: a status and Range, or no answer. */
type Reply = { status: number; range?: string } | "network-error";

/** The parts of a progress event the upload reads. */
interface FakeProgress {
  lengthComputable: boolean;
  loaded: number;
}

/** Stands in for `XMLHttpRequest.upload`, which reports progress. */
class FakeUploadTarget {
  listeners: Record<string, (event: FakeProgress) => void> = {};

  addEventListener(name: string, cb: (event: FakeProgress) => void) {
    this.listeners[name] = cb;
  }
}

/**
 * A fake XMLHttpRequest that answers each request from a script.
 *
 * Requests beyond the script get a 500, so a loop that sends more than
 * the test expects fails loudly rather than hanging.
 */
function scriptXhr(replies: Reply[]) {
  const sent: SentRequest[] = [];
  const queue = [...replies];

  class ScriptedXhr {
    status = 0;
    upload = new FakeUploadTarget();
    listeners: Record<string, () => void> = {};
    range: string | null = null;
    record: SentRequest = { method: "", url: "", headers: {}, bodySize: null };

    open(method: string, url: string) {
      this.record.method = method;
      this.record.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.record.headers[name] = value;
    }
    getResponseHeader(name: string) {
      return name === "Range" ? this.range : null;
    }
    addEventListener(name: string, cb: () => void) {
      this.listeners[name] = cb;
    }
    send(body: Blob | null) {
      this.record.bodySize = body === null ? null : body.size;
      sent.push(this.record);

      const reply = queue.shift() ?? { status: 500 };
      if (reply === "network-error") {
        this.listeners.error?.();
        return;
      }

      if (body !== null) {
        this.upload.listeners.progress?.({
          lengthComputable: true,
          loaded: body.size,
        });
      }
      this.status = reply.status;
      this.range = reply.range ?? null;
      this.listeners.load?.();
    }
  }

  vi.stubGlobal("XMLHttpRequest", ScriptedXhr);

  return sent;
}

/** A file of *size* bytes. */
function fileOf(size: number): File {
  return new File([new Uint8Array(size)], "lecture.mp4", {
    type: "video/mp4",
  });
}

const noWait = {
  wait: () => Promise.resolve(),
  waitForOnline: () => Promise.resolve(),
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("confirmedOffset", () => {
  it("reads the first byte GCS does not hold", () => {
    expect(confirmedOffset("bytes=0-262143")).toBe(262144);
  });

  it("treats no Range as nothing held", () => {
    // GCS leaves the header out entirely before the first byte lands.
    expect(confirmedOffset(null)).toBe(0);
  });

  it("treats a Range it cannot read as nothing held", () => {
    // Resending costs time; trusting a misread offset costs the file.
    expect(confirmedOffset("bytes=10-20")).toBe(0);
    expect(confirmedOffset("nonsense")).toBe(0);
  });
});

describe("uploadResumable", () => {
  it("sends each chunk with the Content-Range GCS expects", async () => {
    const sent = scriptXhr([
      { status: 308, range: `bytes=0-${CHUNK - 1}` },
      { status: 200 },
    ]);

    await uploadResumable("https://gcs/session", fileOf(CHUNK + 100), {
      onProgress: () => undefined,
      chunkBytes: CHUNK,
      ...noWait,
    });

    expect(sent.map((r) => r.headers["Content-Range"])).toEqual([
      `bytes 0-${CHUNK - 1}/${CHUNK + 100}`,
      `bytes ${CHUNK}-${CHUNK + 99}/${CHUNK + 100}`,
    ]);
    expect(sent.map((r) => r.bodySize)).toEqual([CHUNK, 100]);
    expect(sent.every((r) => r.method === "PUT")).toBe(true);
    expect(sent.every((r) => r.url === "https://gcs/session")).toBe(true);
  });

  it("starts the next chunk where GCS says, not where it was sent", async () => {
    // GCS kept only half of the first chunk. Starting the second at
    // CHUNK would leave a gap in the file.
    const half = CHUNK / 2;
    const sent = scriptXhr([
      { status: 308, range: `bytes=0-${half - 1}` },
      { status: 200 },
    ]);

    await uploadResumable("https://gcs/session", fileOf(CHUNK * 2), {
      onProgress: () => undefined,
      chunkBytes: CHUNK,
      ...noWait,
    });

    expect(sent[1].headers["Content-Range"]).toBe(
      `bytes ${half}-${half + CHUNK - 1}/${CHUNK * 2}`,
    );
  });

  it("asks GCS what it holds after a dropped connection, then resumes", async () => {
    const sent = scriptXhr([
      { status: 308, range: `bytes=0-${CHUNK - 1}` },
      "network-error",
      { status: 308, range: `bytes=0-${CHUNK - 1}` },
      { status: 200 },
    ]);
    const retrying: boolean[] = [];

    await uploadResumable("https://gcs/session", fileOf(CHUNK * 2), {
      onProgress: () => undefined,
      onRetrying: (r) => retrying.push(r),
      chunkBytes: CHUNK,
      ...noWait,
    });

    // The question: no body, and only the total named.
    expect(sent[2].bodySize).toBeNull();
    expect(sent[2].headers["Content-Range"]).toBe(`bytes */${CHUNK * 2}`);
    // Then the second chunk again, from the confirmed offset.
    expect(sent[3].headers["Content-Range"]).toBe(
      `bytes ${CHUNK}-${CHUNK * 2 - 1}/${CHUNK * 2}`,
    );
    expect(retrying).toContain(true);
    expect(retrying.at(-1)).toBe(false);
  });

  it("waits the given delays, in order, between tries", async () => {
    scriptXhr([
      "network-error",
      "network-error",
      { status: 308 },
      { status: 200 },
    ]);
    const waited: number[] = [];

    await uploadResumable("https://gcs/session", fileOf(100), {
      onProgress: () => undefined,
      chunkBytes: CHUNK,
      retryDelaysMs: [5, 7, 9],
      wait: (ms) => {
        waited.push(ms);
        return Promise.resolve();
      },
      waitForOnline: () => Promise.resolve(),
    });

    expect(waited).toEqual([5, 7]);
  });

  it("gives up as a lost connection once the retries run out", async () => {
    const sent = scriptXhr(["network-error", "network-error", "network-error"]);

    const result = uploadResumable("https://gcs/session", fileOf(100), {
      onProgress: () => undefined,
      chunkBytes: CHUNK,
      retryDelaysMs: [0, 0],
      ...noWait,
    });

    await expect(result).rejects.toMatchObject({
      kind: "connection",
      status: null,
    });
    // The first try and two retries, and no more.
    expect(sent).toHaveLength(3);
  });

  it("starts the retry count again once GCS accepts more bytes", async () => {
    // Two retries allowed. Three failures in total, but never more than
    // two in a row, so the upload finishes.
    scriptXhr([
      "network-error",
      { status: 308, range: `bytes=0-${CHUNK - 1}` },
      { status: 308, range: `bytes=0-${CHUNK * 2 - 1}` },
      "network-error",
      "network-error",
      { status: 308, range: `bytes=0-${CHUNK * 2 - 1}` },
      { status: 200 },
    ]);

    await expect(
      uploadResumable("https://gcs/session", fileOf(CHUNK * 3), {
        onProgress: () => undefined,
        chunkBytes: CHUNK,
        retryDelaysMs: [0, 0],
        ...noWait,
      }),
    ).resolves.toBeUndefined();
  });

  it("does not retry a refusal that will not change", async () => {
    const sent = scriptXhr([{ status: 403 }]);

    const result = uploadResumable("https://gcs/session", fileOf(100), {
      onProgress: () => undefined,
      chunkBytes: CHUNK,
      ...noWait,
    });

    await expect(result).rejects.toMatchObject({
      kind: "refused",
      status: 403,
    });
    expect(sent).toHaveLength(1);
  });

  it("retries a server error", async () => {
    const sent = scriptXhr([{ status: 503 }, { status: 308 }, { status: 200 }]);

    await uploadResumable("https://gcs/session", fileOf(100), {
      onProgress: () => undefined,
      chunkBytes: CHUNK,
      ...noWait,
    });

    expect(sent).toHaveLength(3);
  });

  it("says the session has gone when GCS no longer knows it", async () => {
    scriptXhr([{ status: 410 }]);

    const result = uploadResumable("https://gcs/session", fileOf(100), {
      onProgress: () => undefined,
      chunkBytes: CHUNK,
      ...noWait,
    });

    await expect(result).rejects.toBeInstanceOf(UploadFailure);
    await expect(result).rejects.toMatchObject({ kind: "session-gone" });
  });

  it("never reports progress going backwards across a retry", async () => {
    // The first chunk reports itself fully sent, then GCS says it kept
    // none of the second. The bar holds rather than falling back.
    scriptXhr([
      { status: 308, range: `bytes=0-${CHUNK - 1}` },
      "network-error",
      { status: 308, range: `bytes=0-${CHUNK - 1}` },
      { status: 200 },
    ]);
    const progress: number[] = [];

    await uploadResumable("https://gcs/session", fileOf(CHUNK * 2), {
      onProgress: (p) => progress.push(p),
      chunkBytes: CHUNK,
      ...noWait,
    });

    for (let i = 1; i < progress.length; i += 1) {
      expect(progress[i]).toBeGreaterThan(progress[i - 1]);
    }
    expect(progress.at(-1)).toBe(100);
  });

  it("waits to be back online before trying again", async () => {
    scriptXhr(["network-error", { status: 308 }, { status: 200 }]);
    const order: string[] = [];

    await uploadResumable("https://gcs/session", fileOf(100), {
      onProgress: () => undefined,
      chunkBytes: CHUNK,
      wait: () => {
        order.push("wait");
        return Promise.resolve();
      },
      waitForOnline: () => {
        order.push("online");
        return Promise.resolve();
      },
    });

    expect(order).toEqual(["online", "wait"]);
  });

  it("finishes an empty file by naming only its size", async () => {
    // A Content-Range of bytes 0 to -1 would be refused.
    const sent = scriptXhr([{ status: 200 }]);

    await uploadResumable("https://gcs/session", fileOf(0), {
      onProgress: () => undefined,
      chunkBytes: CHUNK,
      ...noWait,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].headers["Content-Range"]).toBe("bytes */0");
    expect(sent[0].bodySize).toBeNull();
  });

  it("refuses a chunk size GCS would reject", async () => {
    await expect(
      uploadResumable("https://gcs/session", fileOf(100), {
        onProgress: () => undefined,
        chunkBytes: 1000,
      }),
    ).rejects.toThrow("256 KiB");
  });
});
