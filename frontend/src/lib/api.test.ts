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
});
