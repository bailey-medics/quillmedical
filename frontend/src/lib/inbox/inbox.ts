/**
 * The inbox: what is waiting on me
 *
 * A count from each feature that has something waiting on the person
 * signed in, which the envelope in the top ribbon totals, and the lines
 * behind those counts, which the inbox page lists: what is waiting, and
 * what was lately dealt with.
 *
 * Something waits until it is dealt with, never merely until it is
 * opened. A line says who and what kind, never what anybody wrote. See
 * docs/docs/plans/2026-10-04-waiting-on-me-inbox-plan.md.
 */

import { api } from "@/lib/api";

/** Where the inbox page lives. */
export const INBOX_PATH = "/inbox";

/** One feature's count, as the API sends it. */
export interface InboxCount {
  /** The source's key, such as `feedback_new` */
  source: string;
  count: number;
}

/** Everything waiting on the caller. */
export interface InboxSummary {
  items: InboxCount[];
  total: number;
}

/** One thing that is, or was, waiting on the caller. */
export interface InboxItem {
  source: string;
  /** The row's id within its own feature */
  id: number;
  /** Who or what it is, in words: "Feedback from sam.patel" */
  title: string;
  /** What kind it is, in words */
  detail: string | null;
  /** Where it has got to, in words */
  status: string | null;
  created_at: string;
  done: boolean;
}

/**
 * Where each source's things are dealt with.
 *
 * Kept here and not sent by the server, since they are this client's
 * routes. A new source on the server needs an entry.
 */
const ADDRESSES: Record<string, (id: number) => string> = {
  feedback_new: (id) => `/admin/feedback/${id}`,
  // A reply is read on the sender's own feedback page, which lists all
  // of theirs: there is no page for one.
  feedback_reply: () => "/feedback",
  // The assessor's queue, which lists every open request with the
  // competency asked for. A request is opened from there.
  passport_sign_off: () => "/passport/inbox",
};

/** Whether this client knows where a source's things are dealt with. */
function known(source: unknown): source is string {
  return typeof source === "string" && source in ADDRESSES;
}

/** The page one item is dealt with on. */
export function inboxItemHref(item: InboxItem): string {
  return ADDRESSES[item.source]?.(item.id) ?? INBOX_PATH;
}

/**
 * How many things are waiting, across the sources this client knows.
 *
 * A source it does not know is left out: a newer server may name one,
 * and a count leading nowhere is worse than no count. An answer that is
 * not the expected shape counts as nothing. The envelope is on every
 * page, so it must never be what breaks one.
 */
export function inboxTotal(summary: InboxSummary): number {
  const items: unknown = (summary as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return 0;
  return (items as Partial<InboxCount>[]).reduce(
    (sum, item) =>
      known(item?.source) && typeof item.count === "number" && item.count > 0
        ? sum + item.count
        : sum,
    0,
  );
}

/** How many things are waiting on the caller, a source at a time. */
export function getInbox(): Promise<InboxSummary> {
  return api.get<InboxSummary>("/inbox");
}

/**
 * The lines of the caller's inbox, newest first: what is waiting, or
 * with `done` what was lately dealt with. Lines from a source this
 * client does not know are left out, as in the count.
 */
export async function getInboxItems(done: boolean): Promise<InboxItem[]> {
  const res = await api.get<{ items: InboxItem[] }>(
    `/inbox/items?done=${done ? "true" : "false"}`,
  );
  return res.items.filter((item) => known(item.source));
}

/** The event a page fires once it has dealt with something. */
const CHANGED = "quill:inbox-changed";

/**
 * Say that something waiting has just been dealt with, so the envelope
 * asks again. Without it the count is right only at the next page.
 */
export function inboxChanged(): void {
  window.dispatchEvent(new Event(CHANGED));
}

/** Run `listener` whenever a page says the inbox has changed. */
export function onInboxChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}
