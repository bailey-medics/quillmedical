/**
 * useModuleMedia tests
 *
 * The upload is three steps across two systems, and the ordering is the
 * part worth pinning: the link call is what makes an upload visible, so
 * a flow that sent the bytes but skipped it would leave a module
 * silently incomplete.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

import { api } from "@/lib/api";
import { useModuleMedia } from "./use-module-media";

const media = {
  module_id: "mod-1",
  references: [{ key: "lecture-01", asset: null }],
  unattached: [],
  is_complete: false,
};

/** What one stubbed request recorded. */
interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * A stub XMLHttpRequest that speaks the resumable handshake.
 *
 * GCS answers the opening POST with a session URL in `Location`, and
 * the bytes go there. Modelling that rather than a single PUT is the
 * point: a stub that accepted any request at all is why the real
 * mismatch went unnoticed.
 */
function stubUpload(options: { location?: string | null } = {}) {
  const location =
    options.location === undefined
      ? "https://storage.example/session-42"
      : options.location;
  const requests: RecordedRequest[] = [];

  class FakeXhr {
    status = 200;
    upload = { addEventListener: vi.fn() };
    listeners: Record<string, () => void> = {};
    private record: RecordedRequest = {
      method: "",
      url: "",
      headers: {},
      body: undefined,
    };

    open(method: string, url: string) {
      this.record.method = method;
      this.record.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.record.headers[name] = value;
    }
    getResponseHeader(name: string) {
      // Only the opening POST carries it, exactly as GCS behaves.
      return name === "Location" && this.record.method === "POST"
        ? location
        : null;
    }
    addEventListener(event: string, cb: () => void) {
      this.listeners[event] = cb;
    }
    send(body?: unknown) {
      this.record.body = body;
      requests.push(this.record);
      this.listeners.load?.();
    }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  return requests;
}

/** A stub whose every request fails with *status*. */
function stubFailingUpload(status = 500, event: "load" | "error" = "load") {
  class FailingXhr {
    status = status;
    upload = { addEventListener: vi.fn() };
    listeners: Record<string, () => void> = {};
    open = vi.fn();
    setRequestHeader = vi.fn();
    getResponseHeader = () => null;
    addEventListener(name: string, cb: () => void) {
      this.listeners[name] = cb;
    }
    send() {
      this.listeners[event]?.();
    }
  }
  vi.stubGlobal("XMLHttpRequest", FailingXhr);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useModuleMedia", () => {
  it("loads a module's media", async () => {
    (api.get as Mock).mockResolvedValue(media);

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.media).toEqual(media);
  });

  it("asks for nothing without a module", async () => {
    const { result } = renderHook(() => useModuleMedia(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).not.toHaveBeenCalled();
  });

  it("reports a failure rather than throwing", async () => {
    (api.get as Mock).mockRejectedValue(new Error("nope"));

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));

    await waitFor(() => expect(result.current.error).toBe("nope"));
    expect(result.current.media).toBeNull();
  });

  it("mints a URL, sends the bytes, then records what landed", async () => {
    // The order is the point. The backend never sees the file, so the
    // link call is the only thing that makes the upload real.
    const requests = stubUpload();
    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "https://storage.example/upload",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(["x"], "lecture.mp4", { type: "video/mp4" });
    await act(async () => {
      await result.current.upload("lecture-01", file);
    });

    const calls = (api.post as Mock).mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toContain("/media/upload-url");
    expect(calls[1]).toContain("/media/lecture-01/link");

    // Two requests: open the session, then send the bytes to it.
    expect(requests).toHaveLength(2);
    expect(requests[0].method).toBe("POST");
    expect(requests[1].method).toBe("PUT");
    expect(requests[1].body).toBe(file);
  });

  it("opens the session with the header the URL was signed for", async () => {
    // The signature covers the method and this header. Without it GCS
    // rejects the request as a mismatch, which is precisely how the
    // first version of this failed.
    const requests = stubUpload();
    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "https://storage.example/upload",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    expect(requests[0].headers["x-goog-resumable"]).toBe("start");
    // The opening request carries no body — it only asks for a session.
    expect(requests[0].body).toBeUndefined();
  });

  it("sends the bytes to the session URL, not the signed URL", async () => {
    const requests = stubUpload({ location: "https://storage.example/sess-7" });
    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "https://storage.example/upload",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    expect(requests[0].url).toBe("https://storage.example/upload");
    expect(requests[1].url).toBe("https://storage.example/sess-7");
  });

  it("fails clearly when the session URL is not returned", async () => {
    // The bucket's CORS policy has to expose Location. If it does not,
    // the browser hides the header and the upload has nowhere to go —
    // which should say so rather than appear to hang.
    stubUpload({ location: null });
    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "https://storage.example/upload",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    expect(result.current.error).toContain("session");
    const calls = (api.post as Mock).mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes("/link"))).toBe(false);
  });

  it("says a file is too large rather than showing a status code", async () => {
    // 413 on a video almost always means the file, and "Upload failed
    // (413)" leaves the admin to guess which of size, format or
    // permissions it was.
    stubFailingUpload(413);
    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "/api/teaching/admin/modules/mod-1/media/asset-1/content",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    expect(result.current.error).toContain("too large");
    expect(result.current.error).not.toContain("413");
  });

  it("sends a local upload in one request, with no handshake", async () => {
    // Development has no bucket, so the backend hands back a relative
    // URL and the body comes straight to it. Only GCS speaks resumable.
    const requests = stubUpload();
    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "/api/teaching/admin/modules/mod-1/media/asset-1/content",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const file = new File(["x"], "lecture.mp4", { type: "video/mp4" });
    await act(async () => {
      await result.current.upload("lecture-01", file);
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].body).toBe(file);
  });

  it("does not record a link when the upload fails", async () => {
    // A link without a file is the failure that shows a learner a
    // broken player, so it must not survive a failed upload.
    stubFailingUpload(500);

    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "https://storage.example/upload",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    const calls = (api.post as Mock).mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes("/link"))).toBe(false);
    // A 500 is ours, not the file's, and the message says so — an
    // admin who reads "too large" starts re-exporting a video that was
    // never the problem.
    expect(result.current.error).toContain("not a problem with your file");
  });

  it("clears progress after a failure", async () => {
    // Otherwise the row keeps a bar stuck partway rather than offering
    // the dropzone again.
    stubFailingUpload(500, "error");
    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "https://storage.example/upload",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    expect(result.current.uploadProgress["lecture-01"]).toBeUndefined();
  });

  it("reports an upload in flight, and stops once it lands", async () => {
    // The page blocks navigation on this. A flag that stayed set would
    // trap the admin on the page; one that never set would let them
    // walk away from a transfer that dies with the tab.
    let release: (() => void) | undefined;
    class HeldXhr {
      status = 200;
      upload = { addEventListener: vi.fn() };
      listeners: Record<string, () => void> = {};
      method = "";
      open(method: string) {
        this.method = method;
      }
      setRequestHeader = vi.fn();
      getResponseHeader = (name: string) =>
        name === "Location" && this.method === "POST"
          ? "https://storage.example/session-42"
          : null;
      addEventListener(name: string, cb: () => void) {
        this.listeners[name] = cb;
      }
      send() {
        // The opening POST answers at once; the PUT carrying the bytes
        // is held open, which is the state being tested.
        if (this.method === "POST") {
          this.listeners.load?.();
        } else {
          release = () => this.listeners.load?.();
        }
      }
    }
    vi.stubGlobal("XMLHttpRequest", HeldXhr);

    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "https://storage.example/upload",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.uploading).toBe(false);

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    await waitFor(() => expect(result.current.uploading).toBe(true));

    await act(async () => {
      release?.();
      await pending;
    });

    expect(result.current.uploading).toBe(false);
  });

  it("stops reporting an upload in flight after a failure", async () => {
    // Otherwise a failed upload leaves the page blocking navigation
    // over a transfer that is no longer happening.
    stubFailingUpload(500, "error");
    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "https://storage.example/upload",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    expect(result.current.uploading).toBe(false);
  });

  it("records which reference key failed, and clears it on a retry", async () => {
    // A failed upload returns the row to an empty dropzone, which looks
    // identical to never having tried. The key is what lets the row
    // that failed be the row that says so.
    stubFailingUpload(500, "error");
    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "https://storage.example/upload",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    expect(result.current.uploadErrors["lecture-01"]).toBe(
      "Could not start upload",
    );

    // The retry succeeds, and must not carry the old message with it.
    stubUpload();
    await act(async () => {
      await result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    expect(result.current.uploadErrors["lecture-01"]).toBeUndefined();
  });

  it("deletes an asset and reloads", async () => {
    (api.get as Mock).mockResolvedValue(media);
    (api.del as Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove("asset-1");
    });

    expect(api.del).toHaveBeenCalledWith(
      "/teaching/admin/modules/mod-1/media/asset-1",
    );
    // Two gets: the initial load and the refresh after deleting.
    expect((api.get as Mock).mock.calls.length).toBe(2);
  });
});

describe("polling while a job is running", () => {
  /** One reference whose asset is at the given progress state. */
  const withProgress = (inProgress: boolean) => ({
    module_id: "mod-1",
    references: [
      {
        key: "lecture-01",
        asset: {
          asset_id: "a1",
          original_filename: "lecture.mp4",
          content_type: "video/mp4",
          size_bytes: 1024,
          uploaded_at: "2026-09-17T12:00:00Z",
          progress: {
            stage: 1,
            total_stages: 4,
            label: inProgress ? "Preparing the video" : "Video ready",
            in_progress: inProgress,
          },
        },
      },
    ],
    unattached: [],
    is_complete: true,
  });

  it("asks again while something is still running", async () => {
    // Without this the bar would sit at the same figure until someone
    // reloaded, which is no better than the line it replaces.
    (api.get as Mock).mockResolvedValue(withProgress(true));

    const { result } = renderHook(() => useModuleMedia("mod-1", 20));

    // Wait for the state, not just the call: the polling effect keys off
    // `media`, so installing fake timers before that has landed would
    // start the clock while the interval is not yet registered.
    await waitFor(() =>
      expect(
        result.current.media?.references[0]?.asset?.progress?.in_progress,
      ).toBe(true),
    );

    const before = (api.get as Mock).mock.calls.length;

    // Real timers with a short wait rather than fake ones: the interval
    // is registered inside an effect that runs after an awaited fetch,
    // and swapping the clock underneath that proved unreliable. Ten
    // seconds is the production interval, so the test waits it out.
    await waitFor(() =>
      expect((api.get as Mock).mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("stops once nothing is in progress", async () => {
    // Includes a job that has stalled: there is no point asking every
    // ten seconds about work that has already failed.
    (api.get as Mock).mockResolvedValue(withProgress(false));

    renderHook(() => useModuleMedia("mod-1", 20));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    // Long enough for many intervals to have fired, had any been set.
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
