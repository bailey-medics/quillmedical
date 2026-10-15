import { describe, expect, it } from "vitest";
import { NO_NEW_FIELDS, subscriptionBody } from "./subscriptionBody";

function subscription(described: PushSubscriptionJSON) {
  return { toJSON: () => described };
}

describe("subscriptionBody", () => {
  it("sends the endpoint, the expiry and the two keys", () => {
    const body = subscriptionBody(
      subscription({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        expirationTime: 1790000000000,
        keys: { p256dh: "public-key", auth: "secret" },
      }),
    );

    expect(body).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      expirationTime: 1790000000000,
      keys: { p256dh: "public-key", auth: "secret" },
    });
  });

  it("sends nothing the backend has no place for", () => {
    // A browser may add to its own object, at the top or among the keys.
    const described = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      expirationTime: null,
      keys: { p256dh: "public-key", auth: "secret", somethingNew: "x" },
      options: { userVisibleOnly: true },
    };

    const body = subscriptionBody(subscription(described));

    expect(Object.keys(body).sort()).toEqual([
      "endpoint",
      "expirationTime",
      "keys",
    ]);
    expect(Object.keys(body.keys).sort()).toEqual(["auth", "p256dh"]);
  });

  it("sends null for an expiry the browser left out", () => {
    const body = subscriptionBody(
      subscription({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "public-key", auth: "secret" },
      }),
    );

    expect(body.expirationTime).toBeNull();
  });

  it.each([
    ["no endpoint", { keys: { p256dh: "public-key", auth: "secret" } }],
    ["no keys", { endpoint: "https://fcm.googleapis.com/fcm/send/abc" }],
    [
      "no public key",
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { auth: "secret" },
      },
    ],
    [
      "no secret",
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "public-key" },
      },
    ],
  ])("refuses a subscription with %s", (_, described) => {
    expect(() =>
      subscriptionBody(subscription(described as PushSubscriptionJSON)),
    ).toThrow("incomplete");
  });

  it("knows every field the standard gives a subscription", () => {
    // The check is the type of NO_NEW_FIELDS: it compiles only while the
    // standard's fields are all ones this file knows. See the comment
    // beside it.
    expect(NO_NEW_FIELDS).toBe(true);
  });
});
