/**
 * What the backend is sent when a browser subscribes to notifications.
 *
 * The browser hands back a `PushSubscription`, an object whose shape is
 * set by the Push API standard and not by us. Passing it on whole meant
 * the backend had to take whatever a browser put in it. So this picks
 * out the fields the backend stores, and only those are sent: the
 * backend's model refuses anything else.
 */

/** The body of `POST /push/subscribe`. */
export interface PushSubscriptionBody {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** The fields of the browser's own description that this file knows. */
type KnownFields = "endpoint" | "expirationTime" | "keys";

/**
 * Fails the type check when the standard gains a field.
 *
 * TypeScript's `PushSubscriptionJSON` is generated from the standard. If
 * an update to TypeScript brings a field that is not in `KnownFields`,
 * `NewFields` stops being `never` and this line no longer compiles. That
 * is the moment to decide whether the backend should be sent it: add it
 * to `KnownFields` either way, and to the body and the backend's model
 * if it is wanted.
 */
type NewFields = Exclude<keyof PushSubscriptionJSON, KnownFields>;
export const NO_NEW_FIELDS: [NewFields] extends [never] ? true : never = true;

/**
 * Picks the fields the backend stores out of a browser's subscription.
 *
 * @throws when the browser gave no endpoint or no keys, which a working
 * subscription always has.
 */
export function subscriptionBody(
  subscription: Pick<PushSubscription, "toJSON">,
): PushSubscriptionBody {
  const described = subscription.toJSON();
  const p256dh = described.keys?.p256dh;
  const auth = described.keys?.auth;

  if (!described.endpoint || !p256dh || !auth) {
    throw new Error("The browser's push subscription is incomplete");
  }

  return {
    endpoint: described.endpoint,
    expirationTime: described.expirationTime ?? null,
    keys: { p256dh, auth },
  };
}
