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

    const { result } = renderHook(() => useModuleMedia("mod-1"));

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

    const { result } = renderHook(() => useModuleMedia("mod-1"));

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

    const { result } = renderHook(() => useModuleMedia("mod-1"));
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

    const { result } = renderHook(() => useModuleMedia("mod-1"));
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

    const { result } = renderHook(() => useModuleMedia("mod-1"));
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

    const { result } = renderHook(() => useModuleMedia("mod-1"));
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

  it("sends a local upload in one request, with no handshake", async () => {
    // Development has no bucket, so the backend hands back a relative
    // URL and the body comes straight to it. Only GCS speaks resumable.
    const requests = stubUpload();
    (api.get as Mock).mockResolvedValue(media);
    (api.post as Mock).mockResolvedValue({
      upload_url: "/api/teaching/admin/modules/mod-1/media/asset-1/content",
      asset_id: "asset-1",
    });

    const { result } = renderHook(() => useModuleMedia("mod-1"));
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

    const { result } = renderHook(() => useModuleMedia("mod-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    const calls = (api.post as Mock).mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes("/link"))).toBe(false);
    // Failing at the handshake says so specifically: "could not start"
    // points at the session, not at the bytes, which is the difference
    // between a CORS problem and a transfer that died midway.
    expect(result.current.error).toContain("Could not start upload");
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

    const { result } = renderHook(() => useModuleMedia("mod-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.upload(
        "lecture-01",
        new File(["x"], "lecture.mp4", { type: "video/mp4" }),
      );
    });

    expect(result.current.uploadProgress["lecture-01"]).toBeUndefined();
  });

  it("deletes an asset and reloads", async () => {
    (api.get as Mock).mockResolvedValue(media);
    (api.del as Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useModuleMedia("mod-1"));
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
