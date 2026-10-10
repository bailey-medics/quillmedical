/**
 * The CSRF token the backend set at sign-in.
 *
 * It lives in the `XSRF-TOKEN` cookie, which the page is allowed to read.
 * Sending it back in the `X-CSRF-Token` header shows a request came from
 * this page: another site can make the browser send the cookie, but
 * cannot read it to fill the header in.
 *
 * `api` in `lib/api.ts` adds the header itself. This is for the few
 * requests that cannot go through `api`, such as an upload sent with
 * `XMLHttpRequest` so that it can report progress.
 */

/** The token, or `undefined` when nobody is signed in. */
export function csrfToken(): string | undefined {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("XSRF-TOKEN="));

  if (!cookie) return undefined;

  return decodeURIComponent(cookie.slice("XSRF-TOKEN=".length));
}

/** The header to send, or no header when there is no token. */
export function csrfHeader(): Record<string, string> {
  const token = csrfToken();

  return token ? { "X-CSRF-Token": token } : {};
}
