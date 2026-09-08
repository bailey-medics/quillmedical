/**
 * The page-view opt-out
 *
 * Read before any ping is sent, so turning it off means nothing is sent
 * rather than something being sent and discarded later.
 *
 * This one *is* stored on the device, unlike the session identifier, and that
 * is a deliberate difference. A preference that forgets itself on every
 * refresh is not a preference. Storing it engages the Privacy and Electronic
 * Communications Regulations, and the exemption it relies on is the one the
 * session identifier could not claim: a setting that exists solely to honour
 * a choice the user explicitly made is strictly necessary to provide the
 * thing they asked for.
 */

const KEY = "quill.pageViews.optOut";

/** True when the user has asked not to be counted. */
export function hasOptedOut(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    // A private window, cleared site data, or storage blocked outright.
    // Counting is the lesser harm here: the user has expressed no wish, and
    // a page view carries no identifier that could be traced to them.
    return false;
  }
}

/** Record the user's choice. */
export function setOptedOut(optedOut: boolean): void {
  try {
    if (optedOut) localStorage.setItem(KEY, "true");
    else localStorage.removeItem(KEY);
  } catch {
    // Nothing useful to do: the toggle will read false next time, which the
    // user can see and set again.
  }
}
