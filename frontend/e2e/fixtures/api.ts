/**
 * Call the API as whoever the page is signed in as.
 *
 * For two jobs the screen cannot do. Setting up: a journey about
 * deactivating somebody makes that somebody through the API, so it tests
 * the deactivating and not the user form again. And refusals: a hidden
 * button proves nothing if the request behind it still succeeds, so a
 * refusal journey sends the request too and checks the API says no.
 *
 * `page.request` shares the page's cookies, so these calls carry the same
 * session. A change also needs the CSRF token, which the app reads from
 * the `XSRF-TOKEN` cookie and sends as `X-CSRF-Token`; this does the same.
 */

import { expect, type APIResponse, type Page } from "@playwright/test";

/** One org_unit, as `GET /api/org-units` lists it. */
interface OrgUnitListed {
  id: number;
  name: string;
}

/** The headers a change needs: the CSRF token from the page's cookie. */
async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "XSRF-TOKEN");

  if (token === undefined) {
    throw new Error("No XSRF-TOKEN cookie: is the page signed in?");
  }

  return { "X-CSRF-Token": decodeURIComponent(token.value) };
}

/** Send a change to the API, as the page's user. */
export async function send(
  page: Page,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  data?: unknown,
): Promise<APIResponse> {
  return page.request.fetch(`/api${path}`, {
    method,
    headers: await csrfHeaders(page),
    data,
  });
}

/** Read from the API, as the page's user, failing on anything but 200. */
export async function read<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api${path}`);
  expect(response.status(), `GET /api${path}`).toBe(200);

  return (await response.json()) as T;
}

/** The id of an org_unit the page's user can see, by its name. */
export async function orgUnitId(page: Page, name: string): Promise<number> {
  const listed = await read<{ org_units: OrgUnitListed[] }>(page, "/org-units");
  const unit = listed.org_units.find((candidate) => candidate.name === name);

  if (unit === undefined) {
    throw new Error(`No org_unit called ${name} is visible`);
  }

  return unit.id;
}

/** What a new account is made with. */
export interface NewAccount {
  username: string;
  name: string;
  profession: string;
  orgUnitIds: number[];
  password?: string;
}

/**
 * Make an account through the API, as the page's user, and return its id.
 *
 * The address is the username at `example.test`, so a test can wait for
 * an email to it. The password, unless given, is the username followed
 * by `Pass123!`.
 */
export async function createAccount(
  page: Page,
  account: NewAccount,
): Promise<number> {
  const response = await send(page, "POST", "/users", {
    name: account.name,
    username: account.username,
    email: emailOf(account.username),
    password: account.password ?? `${account.username}Pass123!`,
    base_profession: account.profession,
    org_unit_ids: account.orgUnitIds,
  });
  expect(response.status(), await response.text()).toBe(200);

  return ((await response.json()) as { id: number }).id;
}

/** The address `createAccount` gives a username. */
export function emailOf(username: string): string {
  return `${username}@example.test`;
}
