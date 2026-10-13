/**
 * useVideoAccess tests
 *
 * The pass a module's video is served through: asked for, renewed
 * before it runs out, and kept while a renewal cannot get an answer.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn() },
}));

import { api } from "@/lib/api";
import { RETRY_RENEWAL_MS, useVideoAccess } from "./use-video-access";

const MINUTE = 60 * 1000;
const NOW = new Date("2026-10-13T10:00:00Z").getTime();

/** A grant lasting this many minutes from now. */
function grant(minutes: number) {
  return {
    base_url: "https://media.example/modules/polyps",
    expires_at: new Date(Date.now() + minutes * MINUTE).toISOString(),
  };
}

function refusal(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

/** Let the clock run, and whatever it starts settle. */
async function pass(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  (api.post as Mock).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useVideoAccess", () => {
  it("asks for access to the module and says where its video is", async () => {
    (api.post as Mock).mockResolvedValue(grant(15));

    const { result } = renderHook(() => useVideoAccess("polyps"));

    await waitFor(() =>
      expect(result.current.baseUrl).toBe(
        "https://media.example/modules/polyps",
      ),
    );
    expect(api.post).toHaveBeenCalledWith(
      "/teaching/modules/polyps/video-access",
    );
    expect(result.current).toMatchObject({ loading: false, error: false });
  });

  it("asks for nothing when there is no module", () => {
    const { result } = renderHook(() => useVideoAccess(null));

    expect(api.post).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      baseUrl: null,
      loading: false,
      error: false,
    });
  });

  it("has no access when the first call fails", async () => {
    (api.post as Mock).mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useVideoAccess("polyps"));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.baseUrl).toBeNull();
  });

  it("renews five minutes before the grant runs out", async () => {
    (api.post as Mock).mockResolvedValue(grant(15));
    renderHook(() => useVideoAccess("polyps"));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    await pass(10 * MINUTE - 1000);
    expect(api.post).toHaveBeenCalledTimes(1);
    await pass(1000);

    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("keeps the video when a renewal gets no answer", async () => {
    (api.post as Mock)
      .mockResolvedValueOnce(grant(15))
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useVideoAccess("polyps"));
    await waitFor(() => expect(result.current.baseUrl).not.toBeNull());

    await pass(10 * MINUTE);

    expect(api.post).toHaveBeenCalledTimes(2);
    expect(result.current.baseUrl).toBe("https://media.example/modules/polyps");
    expect(result.current.error).toBe(false);
  });

  it("keeps the video when the server answers a renewal with an error of its own", async () => {
    (api.post as Mock)
      .mockResolvedValueOnce(grant(15))
      .mockRejectedValue(refusal(502));
    const { result } = renderHook(() => useVideoAccess("polyps"));
    await waitFor(() => expect(result.current.baseUrl).not.toBeNull());

    await pass(10 * MINUTE);

    expect(result.current.baseUrl).not.toBeNull();
    expect(result.current.error).toBe(false);
  });

  it("tries a failed renewal again every thirty seconds, and carries on once it works", async () => {
    (api.post as Mock)
      .mockResolvedValueOnce(grant(15))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(grant(15));
    const { result } = renderHook(() => useVideoAccess("polyps"));
    await waitFor(() => expect(result.current.baseUrl).not.toBeNull());

    await pass(10 * MINUTE);
    expect(api.post).toHaveBeenCalledTimes(2);
    await pass(RETRY_RENEWAL_MS);
    expect(api.post).toHaveBeenCalledTimes(3);
    await pass(RETRY_RENEWAL_MS);

    expect(api.post).toHaveBeenCalledTimes(4);
    expect(result.current.baseUrl).not.toBeNull();
    expect(result.current.error).toBe(false);

    // Renewed: the next call is ten minutes on, not thirty seconds.
    await pass(RETRY_RENEWAL_MS * 4);
    expect(api.post).toHaveBeenCalledTimes(4);
  });

  it("gives up when the old grant has run out and no renewal has worked", async () => {
    (api.post as Mock)
      .mockResolvedValueOnce(grant(15))
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useVideoAccess("polyps"));
    await waitFor(() => expect(result.current.baseUrl).not.toBeNull());

    await pass(15 * MINUTE - 1000);
    expect(result.current.baseUrl).not.toBeNull();
    await pass(2000);

    expect(result.current.baseUrl).toBeNull();
    expect(result.current.error).toBe(true);
  });

  it.each([401, 403, 404])(
    "ends the grant at once when a renewal is refused with %i",
    async (status) => {
      // How somebody whose access was taken away stops being served.
      (api.post as Mock)
        .mockResolvedValueOnce(grant(15))
        .mockRejectedValue(refusal(status));
      const { result } = renderHook(() => useVideoAccess("polyps"));
      await waitFor(() => expect(result.current.baseUrl).not.toBeNull());

      await pass(10 * MINUTE);

      expect(result.current.baseUrl).toBeNull();
      expect(result.current.error).toBe(true);
      await pass(RETRY_RENEWAL_MS * 3);
      expect(api.post).toHaveBeenCalledTimes(2);
    },
  );

  it("stops renewing once the page is left", async () => {
    (api.post as Mock)
      .mockResolvedValueOnce(grant(15))
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const { result, unmount } = renderHook(() => useVideoAccess("polyps"));
    await waitFor(() => expect(result.current.baseUrl).not.toBeNull());
    await pass(10 * MINUTE);

    unmount();
    await pass(RETRY_RENEWAL_MS * 4);

    expect(api.post).toHaveBeenCalledTimes(2);
  });
});
