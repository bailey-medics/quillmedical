/**
 * useInbox
 *
 * How many things are waiting on the person signed in, fetched when the layout
 * mounts, on each change of page, and when a page says it has dealt with
 * something.
 *
 * It also asks again each minute while the tab is visible, and at once
 * when the tab comes back into view, so that somebody who leaves Quill
 * open on one page still sees what arrives. Nothing is asked while the
 * tab is hidden: there is nobody to show a count to, and returning to it
 * asks straight away. Not live: that would need the server to push, over
 * a connection the application does not hold open.
 *
 * A failed fetch leaves the last answer in place and says nothing. The
 * envelope is on every page, and a count that cannot be fetched is not
 * an error worth interrupting whatever the page is for.
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import {
  INBOX_REFRESH_MS,
  getInbox,
  inboxTotal,
  onInboxChanged,
} from "./inbox";

/** How many things are waiting on the person signed in. */
export function useInbox(): number {
  const { state } = useAuth();
  const { pathname } = useLocation();
  const signedIn = state.status === "authenticated";
  const [waiting, setWaiting] = useState(0);
  // Bumped to ask again: when a page says something has been dealt
  // with, each minute, and when the tab comes back into view.
  const [asked, setAsked] = useState(0);

  useEffect(() => onInboxChanged(() => setAsked((n) => n + 1)), []);

  useEffect(() => {
    if (!signedIn) return;
    // Both the timer and the return to the tab ask only while the tab
    // can be seen. `visibilitychange` fires on hiding as well as on
    // showing, and the check lets the showing through alone.
    const askIfVisible = () => {
      if (document.visibilityState === "visible") setAsked((n) => n + 1);
    };
    const timer = window.setInterval(askIfVisible, INBOX_REFRESH_MS);
    document.addEventListener("visibilitychange", askIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", askIfVisible);
    };
  }, [signedIn]);

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
