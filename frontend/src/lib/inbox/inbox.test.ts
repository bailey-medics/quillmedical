import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiLib from "@/lib/api";
import {
  getInboxItems,
  inboxChanged,
  inboxItemHref,
  inboxTotal,
  onInboxChanged,
  type InboxItem,
} from "./inbox";

const item: InboxItem = {
  source: "feedback_new",
  id: 7,
  title: "Feedback from sam.patel",
  detail: "Something is broken",
  status: "New",
  created_at: "2026-10-04T10:00:00Z",
  done: false,
};

describe("inboxTotal", () => {
  it("adds up the sources this client knows", () => {
    expect(
      inboxTotal({ items: [{ source: "feedback_new", count: 3 }], total: 3 }),
    ).toBe(3);
  });

  it("leaves out a source this client does not know", () => {
    // A newer server may name one, and a count leading nowhere is worse
    // than no count.
    expect(
      inboxTotal({
        items: [
          { source: "something_new", count: 5 },
          { source: "feedback_new", count: 1 },
        ],
        total: 6,
      }),
    ).toBe(1);
  });

  it("counts nothing for an answer that is not the expected shape", () => {
    // The envelope is on every page, so it must never be what breaks one.
    expect(inboxTotal({} as never)).toBe(0);
    expect(inboxTotal(null as never)).toBe(0);
    expect(inboxTotal([] as never)).toBe(0);
    expect(inboxTotal({ items: [null, {}] } as never)).toBe(0);
  });
});

describe("inboxItemHref", () => {
  it("gives the page a piece of feedback is dealt with on", () => {
    expect(inboxItemHref(item)).toBe("/admin/feedback/7");
  });

  it("sends a sign-off request to the assessor's queue", () => {
    expect(inboxItemHref({ ...item, source: "passport_sign_off" })).toBe(
      "/passport/inbox",
    );
  });

  it("sends a reply to the sender's own feedback page", () => {
    expect(inboxItemHref({ ...item, source: "feedback_reply" })).toBe(
      "/feedback",
    );
  });
});

describe("getInboxItems", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("asks for what is waiting, or what was dealt with", async () => {
    const get = vi.spyOn(apiLib.api, "get").mockResolvedValue({ items: [] });

    await getInboxItems(false);
    await getInboxItems(true);

    expect(get).toHaveBeenNthCalledWith(1, "/inbox/items?done=false");
    expect(get).toHaveBeenNthCalledWith(2, "/inbox/items?done=true");
  });

  it("leaves out lines from a source this client does not know", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      items: [item, { ...item, source: "something_new", id: 8 }],
    });

    expect(await getInboxItems(false)).toEqual([item]);
  });
});

describe("inboxChanged", () => {
  it("tells whoever is listening, until they stop", () => {
    const listener = vi.fn();
    const stop = onInboxChanged(listener);

    inboxChanged();
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    inboxChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
