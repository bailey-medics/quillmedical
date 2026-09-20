/**
 * API Client Module
 *
 * Centralized HTTP client for making authenticated API requests to the FastAPI backend.
 * Handles automatic token refresh, CSRF protection, error parsing, and redirects on
 * authentication failure. All requests include credentials (cookies) and use JSON format.
 */

import {
  CLIENT_COMPAT_GENERATION,
  COMPAT_GENERATION_HEADER,
  COMPAT_MISMATCH_EVENT,
  checkCompatGeneration,
  isReloadPending,
  markReloadPending,
} from "@lib/compat-generation/compatGeneration";
import { clearRetryRecord } from "@lib/compat-generation/retryState";
import { recordApi, recordAuth } from "@lib/error-reporting/breadcrumbs";

/**
 * Compat-Generation response interceptor
 *
 * Compares this bundle's baked-in generation against the value the
 * backend just served. On a client-behind mismatch, marks a reload as
 * pending (blocking further mutating requests) and dispatches
 * COMPAT_MISMATCH_EVENT for ForcedReloadGate to act on. Never infers
 * incompatibility from a missing/invalid header. See
 * docs/docs/plans/2026-08-09-sub-plan-api-compatibility-plan.md.
 */
function checkCompatHeader(res: Response): void {
  const result = checkCompatGeneration(
    CLIENT_COMPAT_GENERATION,
    res.headers.get(COMPAT_GENERATION_HEADER),
  );
  if (result === "compatible") {
    clearRetryRecord();
    return;
  }
  if (result === "client-behind") {
    markReloadPending();
    window.dispatchEvent(
      new CustomEvent(COMPAT_MISMATCH_EVENT, {
        detail: {
          serverGeneration: Number(res.headers.get(COMPAT_GENERATION_HEADER)),
        },
      }),
    );
  }
}

/**
 * HTTP Methods
 *
 * Supported HTTP methods for API requests.
 */
export type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Request Options
 *
 * Configuration options for API requests, extending RequestInit but excluding
 * method, body, and credentials (managed internally).
 */
type Options = Omit<RequestInit, "method" | "body" | "credentials"> & {
  method?: HTTPMethod;
  body?: unknown;
  retry?: boolean;
};

/**
 * Turn a caller's body into something `fetch` can send.
 *
 * Everything is JSON here except a file upload, which arrives as
 * `FormData` and has to go through untouched: `JSON.stringify` on it
 * yields `"{}"`, so the file was silently dropped and the server saw an
 * empty body it could not parse. The upload failed with no clue that
 * the file had never left the browser.
 */
function serialiseBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return body;
  }
  return JSON.stringify(body);
}

/**
 * Core API Request Handler
 *
 * Makes an authenticated HTTP request to the backend API with automatic token
 * refresh on 401 responses. Handles JSON serialization/deserialization, error
 * extraction from FastAPI responses, and login redirects.
 *
 * Authentication Flow:
 * 1. Send request with credentials (JWT cookies)
 * 2. On 401, attempt token refresh via POST /api/auth/refresh
 * 3. If refresh succeeds, retry original request
 * 4. If refresh fails, redirect to login page
 *
 * Error Handling:
 * - Extracts error messages from FastAPI { detail: ... } responses
 * - Attaches error_code to Error object when present
 * - Falls back to status text or response body on parse failure
 *
 * @param path - API endpoint path (without /api prefix)
 * @param opts - Request configuration options
 * @returns Promise resolving to typed response data
 * @throws Error with message from backend or HTTP status text
 */
async function request<T>(path: string, opts: Options = {}): Promise<T> {
  // Defensive programming: validate inputs
  if (!path) {
    throw new Error("API path cannot be empty");
  }
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with '/', got: ${path}`);
  }

  // Pre-check: if browser reports offline, fail fast
  if (!navigator.onLine) {
    window.dispatchEvent(new CustomEvent("app:network-error"));
    throw new Error("No network connection");
  }

  // Auto-include CSRF token for state-changing requests
  const method = opts.method ?? "GET";

  // A forced reload is already pending (this tab is speaking a contract
  // the backend no longer honours) — stop further mutations rather than
  // sending a request that will only compound the mismatch.
  if (method !== "GET" && isReloadPending()) {
    throw new Error("App update pending — please wait for the page to reload.");
  }

  // A FormData body carries a file, and the browser has to set its own
  // `Content-Type` for that: the header has to name a multipart
  // boundary that only the browser knows. Declaring JSON over it, or
  // passing an empty string, both leave the request unparseable at the
  // far end — an upload then failed before the file ever left.
  const isFormData =
    typeof FormData !== "undefined" && opts.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...((opts.headers as Record<string, string>) ?? {}),
  };

  // A caller asking for no content type gets none, rather than an empty
  // one. `fetch` sends `Content-Type:` with nothing after it otherwise,
  // which is not the same as leaving it out.
  for (const [name, value] of Object.entries(headers)) {
    if (value === "") delete headers[name];
  }
  if (method !== "GET" && !headers["X-CSRF-Token"]) {
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith("XSRF-TOKEN="));
    if (match) {
      headers["X-CSRF-Token"] = decodeURIComponent(match.split("=")[1]);
    }
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "include",
      // FormData goes as itself. `JSON.stringify` on it yields "{}",
      // so the file was silently dropped and the server saw an empty
      // body it could not parse.
      body: serialiseBody(opts.body),
    });
  } catch (err) {
    // TypeError from fetch indicates a network failure (DNS, connection refused, etc.)
    if (err instanceof TypeError) {
      window.dispatchEvent(new CustomEvent("app:network-error"));
    }
    throw err;
  }

  checkCompatHeader(res);

  // Breadcrumb for an error report: method, path pattern and status only.
  // The path is reduced to a pattern by allowlist inside recordApi, so no
  // identifier from a URL is recorded, and no request or response body is
  // touched at all.
  recordApi(method, path, res.status);

  // Silent, single refresh try on 401
  if (res.status === 401 && !opts.retry) {
    const refreshed = await fetch(`/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) {
      recordAuth("refresh");
      return request<T>(path, { ...opts, retry: true });
    }
    recordAuth("expired");
  }

  if (res.status === 401) {
    // Redirect to the login page relative to the configured base URL.
    // Skip redirect for guest-accessible paths (password reset, register, etc.)
    const base = (import.meta.env.BASE_URL as string) || "/";
    const loginPath = `${base.replace(/\/$/, "")}/login`;
    const guestPaths = [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/verify-email-pending",
      "/teaching/register",
      // Opened by somebody with no account at all: the signed token in
      // the URL is what authenticates them. Without this the page loads,
      // AuthContext asks /api/auth/me, gets the 401 it should expect,
      // and this handler sends an invited assessor to /login before
      // they can register.
      "/passport/assessors/accept",
    ];
    const currentPath = window.location.pathname;
    const isGuestPath = guestPaths.some(
      (p) => currentPath === p || currentPath.startsWith(p + "/"),
    );
    if (!isGuestPath && currentPath !== loginPath) {
      window.location.assign(loginPath);
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    let errorCode: string | undefined = undefined;
    let extraEmail: string | undefined = undefined;
    try {
      const data = await res.json();
      // FastAPI often returns { detail: { message: ..., error_code: ... } }
      // Handle both cases where `detail` is a string or an object.
      if (data && typeof data === "object") {
        const detail = (data as Record<string, unknown>)["detail"];
        if (detail && typeof detail === "object") {
          // detail is an object with nested message / error_code
          const d = detail as Record<string, unknown>;
          if (typeof d["message"] === "string")
            message = d["message"] as string;
          else if (typeof d["detail"] === "string")
            message = d["detail"] as string;
          errorCode = (d["error_code"] as string) ?? undefined;
          if (typeof d["email"] === "string") extraEmail = d["email"] as string;
        } else {
          // detail is likely a string
          message = (data?.detail ?? data?.message ?? message) as string;
          errorCode = (data as Record<string, unknown>)["error_code"] as
            string | undefined;
        }
      }
    } catch {
      try {
        message = await res.text();
      } catch {
        /* ignore */
      }
    }
    const err = new Error(message || `HTTP ${res.status}`) as Error & {
      error_code?: string;
      status?: number;
      email?: string;
    };
    if (errorCode) err.error_code = errorCode;
    if (extraEmail) err.email = extraEmail;
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) {
    window.dispatchEvent(new CustomEvent("app:api-success"));
    return undefined as T;
  }

  // Signal successful API communication for connectivity tracking
  window.dispatchEvent(new CustomEvent("app:api-success"));

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }

  // Reject non-JSON responses — the backend API should always return JSON.
  // A text/html 200 (e.g. from a misconfigured proxy or placeholder service)
  // must never be silently accepted as valid data.
  throw new Error(`Unexpected response content-type: ${ct || "none"}`);
}

/**
 * API Client
 *
 * Exported API client with convenience methods for common HTTP operations.
 * All methods automatically include authentication cookies and handle token refresh.
 *
 * @example
 * // GET request
 * const patients = await api.get<Patient[]>('/patients');
 *
 * // POST request with body
 * await api.post('/auth/login', { username, password });
 *
 * // PUT request with custom headers
 * await api.put('/patients/123/demographics', data, {
 *   headers: { 'X-CSRF-Token': token }
 * });
 */
/**
 * Blob Request Handler
 *
 * Makes an authenticated request expecting a binary response (e.g. PDF download).
 * Handles credentials, CSRF, and 401 retry like the JSON request handler, but
 * returns the response as a Blob instead of parsing JSON.
 */
async function requestBlob(path: string, opts: Options = {}): Promise<Blob> {
  if (!path) throw new Error("API path cannot be empty");
  if (!path.startsWith("/"))
    throw new Error(`API path must start with '/', got: ${path}`);

  if (!navigator.onLine) {
    window.dispatchEvent(new CustomEvent("app:network-error"));
    throw new Error("No network connection");
  }

  const method = opts.method ?? "GET";

  if (method !== "GET" && isReloadPending()) {
    throw new Error("App update pending — please wait for the page to reload.");
  }

  const headers: Record<string, string> = {
    ...((opts.headers as Record<string, string>) ?? {}),
  };
  if (method !== "GET" && !headers["X-CSRF-Token"]) {
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith("XSRF-TOKEN="));
    if (match) {
      headers["X-CSRF-Token"] = decodeURIComponent(match.split("=")[1]);
    }
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "include",
      // FormData goes as itself. `JSON.stringify` on it yields "{}",
      // so the file was silently dropped and the server saw an empty
      // body it could not parse.
      body: serialiseBody(opts.body),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      window.dispatchEvent(new CustomEvent("app:network-error"));
    }
    throw err;
  }

  checkCompatHeader(res);

  if (res.status === 401 && !opts.retry) {
    const refreshed = await fetch(`/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) return requestBlob(path, { ...opts, retry: true });
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.blob();
}

export const api = {
  /** Core request handler */
  request,
  /** GET request */
  get: <T>(path: string, opts?: Omit<Options, "method" | "body">) =>
    request<T>(path, { ...opts, method: "GET" }),
  /** POST request with optional body */
  post: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<Options, "method" | "body">,
  ) => request<T>(path, { ...opts, method: "POST", body }),
  /** PUT request with optional body */
  put: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<Options, "method" | "body">,
  ) => request<T>(path, { ...opts, method: "PUT", body }),
  /** PATCH request with optional body */
  patch: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<Options, "method" | "body">,
  ) => request<T>(path, { ...opts, method: "PATCH", body }),
  /** DELETE request */
  del: <T>(path: string, opts?: Omit<Options, "method" | "body">) =>
    request<T>(path, { ...opts, method: "DELETE" }),
  /** Binary/blob download (e.g. PDF certificates) */
  blob: (path: string, opts?: Omit<Options, "method" | "body">) =>
    requestBlob(path, { ...opts, method: "GET" }),
};
