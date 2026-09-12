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

/** A stub XMLHttpRequest that reports success without a network. */
function stubUpload() {
  const send = vi.fn();
  class FakeXhr {
    status = 200;
    upload = { addEventListener: vi.fn() };
    listeners: Record<string, () => void> = {};
    open = vi.fn();
    setRequestHeader = vi.fn();
    addEventListener(event: string, cb: () => void) {
      this.listeners[event] = cb;
    }
    send(body: unknown) {
      send(body);
      this.listeners.load?.();
    }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  return send;
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
    const sent = stubUpload();
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
    expect(sent).toHaveBeenCalledWith(file);
    expect(calls[1]).toContain("/media/lecture-01/link");
  });

  it("does not record a link when the upload fails", async () => {
    // A link without a file is the failure that shows a learner a
    // broken player, so it must not survive a failed upload.
    class FailingXhr {
      status = 500;
      upload = { addEventListener: vi.fn() };
      listeners: Record<string, () => void> = {};
      open = vi.fn();
      setRequestHeader = vi.fn();
      addEventListener(event: string, cb: () => void) {
        this.listeners[event] = cb;
      }
      send() {
        this.listeners.load?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", FailingXhr);

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
    expect(result.current.error).toContain("Upload failed");
  });

  it("clears progress after a failure", async () => {
    // Otherwise the row keeps a bar stuck partway rather than offering
    // the dropzone again.
    vi.stubGlobal(
      "XMLHttpRequest",
      class {
        status = 500;
        upload = { addEventListener: vi.fn() };
        listeners: Record<string, () => void> = {};
        open = vi.fn();
        setRequestHeader = vi.fn();
        addEventListener(e: string, cb: () => void) {
          this.listeners[e] = cb;
        }
        send() {
          this.listeners.error?.();
        }
      },
    );
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
