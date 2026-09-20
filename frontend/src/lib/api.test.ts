/**
 * API Client Tests
 *
 * Covers the core request handler, especially defensive behaviour
 * against non-JSON responses that could bypass authentication checks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("api.request", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on a successful JSON response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ id: "1", username: "alice" }),
    );

    const result = await api.get<{ id: string; username: string }>("/auth/me");
    expect(result).toEqual({ id: "1", username: "alice" });
  });

  it("sends a file upload as itself rather than as JSON", async () => {
    // `JSON.stringify` on FormData yields "{}", so the file was
    // silently dropped and the upload failed with no sign that it had
    // never left the browser.
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ hash: "abc" }));

    const form = new FormData();
    form.append("file", new Blob(["x"]), "scan.png");
    await api.post("/passport/1/evidence", form);

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("leaves the content type off a file upload", async () => {
    // The browser has to set its own, naming a multipart boundary only
    // it knows. Declaring JSON over it leaves the request unparseable.
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ hash: "abc" }));

    const form = new FormData();
    form.append("file", new Blob(["x"]), "scan.png");
    await api.post("/passport/1/evidence", form);

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("throws on a non-JSON 200 response (e.g. HTML placeholder page)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      htmlResponse("<html><title>Congratulations</title></html>"),
    );

    await expect(api.get("/auth/me")).rejects.toThrow(
      /unexpected response content-type/i,
    );
  });

  it("throws on a 200 response with no content-type header", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await expect(api.get("/test")).rejects.toThrow(
      /unexpected response content-type/i,
    );
  });

  it("returns undefined for 204 No Content", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await api.post("/auth/logout");
    expect(result).toBeUndefined();
  });

  it("throws with backend error message on non-ok JSON response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: "Not authenticated" }, 403),
    );

    await expect(api.get("/protected")).rejects.toThrow("Not authenticated");
  });

  it("throws on network error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(api.get("/auth/me")).rejects.toThrow("Failed to fetch");
  });

  it("dispatches app:network-error when navigator.onLine is false", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    const handler = vi.fn();
    window.addEventListener("app:network-error", handler);

    await expect(api.get("/auth/me")).rejects.toThrow("No network connection");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();

    window.removeEventListener("app:network-error", handler);
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  it("dispatches app:network-error on TypeError from fetch", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const handler = vi.fn();
    window.addEventListener("app:network-error", handler);

    await expect(api.get("/auth/me")).rejects.toThrow("Failed to fetch");
    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener("app:network-error", handler);
  });

  it("dispatches app:api-success on successful response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));
    const handler = vi.fn();
    window.addEventListener("app:api-success", handler);

    await api.get("/test");
    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener("app:api-success", handler);
  });

  it("dispatches app:api-success on 204 response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const handler = vi.fn();
    window.addEventListener("app:api-success", handler);

    await api.post("/auth/logout");
    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener("app:api-success", handler);
  });

  it("does not dispatch app:api-success on error response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: "Forbidden" }, 403),
    );
    const handler = vi.fn();
    window.addEventListener("app:api-success", handler);

    await expect(api.get("/protected")).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();

    window.removeEventListener("app:api-success", handler);
  });

  describe("the redirect to login on a 401", () => {
    /**
     * Stubs the navigation and reports where it was sent.
     *
     * `window.location.assign` is what the handler calls, and jsdom
     * refuses to navigate for real, so it is replaced outright.
     */
    function watchNavigation(path: string): { to: string | null } {
      const seen: { to: string | null } = { to: null };
      Object.defineProperty(window, "location", {
        configurable: true,
        value: {
          pathname: path,
          assign: (url: string) => {
            seen.to = url;
          },
        },
      });
      return seen;
    }

    it("leaves an invited assessor on the accept page", async () => {
      // The page is opened by somebody with no account: the signed
      // token in the URL is what authenticates them. AuthContext still
      // asks /api/auth/me and still gets a 401, and sending them to
      // /login on that basis stops them registering at all.
      const seen = watchNavigation("/passport/assessors/accept");
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ detail: "Not authenticated" }, 401),
      );

      await expect(api.get("/auth/me")).rejects.toThrow();

      expect(seen.to).toBeNull();
    });

    it("still sends an ordinary page to login", async () => {
      const seen = watchNavigation("/passport");
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ detail: "Not authenticated" }, 401),
      );

      await expect(api.get("/auth/me")).rejects.toThrow();

      expect(seen.to).toBe("/login");
    });
  });
});
