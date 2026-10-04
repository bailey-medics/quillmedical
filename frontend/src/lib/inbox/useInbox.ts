/**
 * useInbox
 *
 * How many things are waiting on the person signed in, fetched when the layout
 * mounts, on each change of page, and when a page says it has dealt with
 * something. Not polled and not live: an email covers the time away, and
 * a count that is right at each page is enough inside the application.
 *
 * A failed fetch leaves the last answer in place and says nothing. The
 * envelope is on every page, and a count that cannot be fetched is not
 * an error worth interrupting whatever the page is for.
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { getInbox, inboxTotal, onInboxChanged } from "./inbox";

/** How many things are waiting on the person signed in. */
export function useInbox(): number {
  const { state } = useAuth();
  const { pathname } = useLocation();
  const signedIn = state.status === "authenticated";
  const [waiting, setWaiting] = useState(0);
  // Bumped when a page says something has been dealt with.
  const [asked, setAsked] = useState(0);

  useEffect(() => onInboxChanged(() => setAsked((n) => n + 1)), []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    getInbox()
      .then((found) => {
        if (!cancelled) setWaiting(inboxTotal(found));
      })
      .catch(() => {
        // Left as it was. See the note at the top.
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, pathname, asked]);

  return signedIn ? waiting : 0;
}
