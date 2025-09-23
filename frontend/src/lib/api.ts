// src/lib/api.ts
export type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type Options = Omit<RequestInit, "method" | "body" | "credentials"> & {
  method?: HTTPMethod;
  body?: unknown;
  retry?: boolean;
};

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    credentials: "include",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  // Silent, single refresh try on 401
  if (res.status === 401 && !opts.retry) {
    const refreshed = await fetch(`/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) return request<T>(path, { ...opts, retry: true });
  }

  if (res.status === 401) {
    // Redirect to the login page relative to the configured base URL so
    // the SPA remains under `/app/` when served behind a reverse proxy.
    const base = (import.meta.env.BASE_URL as string) || "/";
    const loginPath = `${base.replace(/\/$/, "")}/login`;
    if (window.location.pathname !== loginPath) {
      window.location.assign(loginPath);
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    let errorCode: string | undefined = undefined;
    try {
      const data = await res.json();
      // FastAPI often returns { detail: { message: ..., error_code: ... } }
      // Handle both cases where `detail` is a string or an object.
      if (data && typeof data === "object") {
        const detail = (data as Record<string, unknown>)["detail"];
        if (detail && typeof detail === "object") {
          // detail is an object with nested message / error_code
          const d = detail as Record<string, unknown>;
          if (typeof d["message"] === "string") message = d["message"] as string;
          else if (typeof d["detail"] === "string") message = d["detail"] as string;
          errorCode = (d["error_code"] as string) ?? undefined;
        } else {
          // detail is likely a string
          message = (data?.detail ?? data?.message ?? message) as string;
          errorCode = (data as Record<string, unknown>)["error_code"] as string | undefined;
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
    };
    if (errorCode) err.error_code = errorCode;
    throw err;
  }

  if (res.status === 204) return undefined as T;

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export const api = {
  request,
  get: <T>(path: string, opts?: Omit<Options, "method" | "body">) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<Options, "method" | "body">) =>
    request<T>(path, { ...opts, method: "POST", body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<Options, "method" | "body">) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<Options, "method" | "body">) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  del: <T>(path: string, opts?: Omit<Options, "method" | "body">) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};
