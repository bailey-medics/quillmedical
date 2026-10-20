/**
 * useModuleMedia: what the page is told while an upload retries
 *
 * Kept apart from `use-module-media.test.ts` because the chunked send is
 * replaced here, so the hook's handling of retrying and of each way an
 * upload stops can be driven directly, without waiting out real delays.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

vi.mock("@/features/teaching/resumable-upload", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/teaching/resumable-upload")
    >();

  return {
    ...actual,
    uploadResumable:
      vi.fn<
        typeof import("@/features/teaching/resumable-upload").uploadResumable
      >(),
  };
});

import { api } from "@/lib/api";
import {
  UploadFailure,
  uploadResumable,
} from "@/features/teaching/resumable-upload";
import { useModuleMedia } from "./use-module-media";

const media = {
  module_id: "mod-1",
  references: [{ key: "lecture-01", asset: null }],
  unattached: [],
  is_complete: false,
};

/** Answer the opening POST with a session, as GCS does. */
function stubSessionStart() {
  class StartXhr {
    status = 200;
    listeners: Record<string, () => void> = {};
    open = vi.fn();
    setRequestHeader = vi.fn();
    getResponseHeader = (name: string) =>
      name === "Location" ? "https://storage.example/session-42" : null;
    addEventListener(name: string, cb: () => void) {
      this.listeners[name] = cb;
    }
    send() {
      this.listeners.load?.();
    }
  }
  vi.stubGlobal("XMLHttpRequest", StartXhr);
}

async function renderReady() {
  (api.get as Mock).mockResolvedValue(media);
  (api.post as Mock).mockResolvedValue({
    upload_url: "https://storage.example/upload",
    asset_id: "asset-1",
  });

  const hook = renderHook(() => useModuleMedia("mod-1", 20));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));

  return hook;
}

const file = () => new File(["x"], "lecture.mp4", { type: "video/mp4" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  stubSessionStart();
});

describe("useModuleMedia while an upload retries", () => {
  it("says which upload is retrying, and stops saying so when it moves", async () => {
    const control: { onRetrying?: (r: boolean) => void; finish?: () => void } =
      {};
    vi.mocked(uploadResumable).mockImplementation(
      (_url, _file, options) =>
        new Promise<void>((resolve) => {
          control.onRetrying = options.onRetrying;
          control.finish = resolve;
        }),
    );
    const { result } = await renderReady();

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.upload("lecture-01", file());
    });
    await waitFor(() => expect(control.onRetrying).toBeDefined());

    act(() => control.onRetrying?.(true));
    expect(result.current.uploadRetrying["lecture-01"]).toBe(true);

    act(() => control.onRetrying?.(false));
    expect(result.current.uploadRetrying["lecture-01"]).toBeUndefined();

    await act(async () => {
      control.finish?.();
      await pending;
    });
  });

  it("clears retrying when the upload gives up", async () => {
    // Otherwise the row would say it is retrying beside a message that
    // says it failed.
    vi.mocked(uploadResumable).mockImplementation((_url, _file, options) => {
      options.onRetrying?.(true);
      return Promise.reject(new UploadFailure("connection", null));
    });
    const { result } = await renderReady();

    await act(async () => {
      await result.current.upload("lecture-01", file());
    });

    expect(result.current.uploadRetrying["lecture-01"]).toBeUndefined();
    expect(result.current.uploadErrors["lecture-01"]).toBeDefined();
  });

  it("says the session closed when GCS no longer knows it", async () => {
    vi.mocked(uploadResumable).mockRejectedValue(
      new UploadFailure("session-gone", 410),
    );
    const { result } = await renderReady();

    await act(async () => {
      await result.current.upload("lecture-01", file());
    });

    expect(result.current.uploadErrors["lecture-01"]).toContain(
      "Google closed it",
    );
  });

  it("describes a refusal by its status", async () => {
    vi.mocked(uploadResumable).mockRejectedValue(
      new UploadFailure("refused", 403),
    );
    const { result } = await renderReady();

    await act(async () => {
      await result.current.upload("lecture-01", file());
    });

    expect(result.current.uploadErrors["lecture-01"]).toContain("permission");
  });

  it("does not record a link when the chunked send fails", async () => {
    vi.mocked(uploadResumable).mockRejectedValue(
      new UploadFailure("connection", null),
    );
    const { result } = await renderReady();

    await act(async () => {
      await result.current.upload("lecture-01", file());
    });

    const calls = (api.post as Mock).mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes("/link"))).toBe(false);
  });
});
