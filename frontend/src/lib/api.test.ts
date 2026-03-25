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
});
