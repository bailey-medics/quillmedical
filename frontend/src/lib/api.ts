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
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = (data?.detail ?? data?.message ?? message) as string;
    } catch {
      try {
        message = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(message || `HTTP ${res.status}`);
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
  post: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<Options, "method" | "body">
  ) => request<T>(path, { ...opts, method: "POST", body }),
  put: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<Options, "method" | "body">
  ) => request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<Options, "method" | "body">
  ) => request<T>(path, { ...opts, method: "PATCH", body }),
  del: <T>(path: string, opts?: Omit<Options, "method" | "body">) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};
