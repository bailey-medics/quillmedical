/**
 * Admin Passport Page
 *
 * At `/admin/passport`: a Quill operator starts the framework sync job by
 * hand, for when a framework repository merged and the framework
 * pipeline's own start of the sync failed. One run catches up on every
 * version missing.
 *
 * Operator-only: frameworks belong to every organisation at once. The
 * route guard hides the page; the API refuses anybody else.
 *
 * A run takes up to ten minutes and is one transaction, so nothing shows
 * it while it goes. After a start, the page asks again every half minute
 * until a run newer than the press has finished, and gives up after a
 * quarter of an hour, when the job's own time limit has long passed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import ErrorState from "@/components/error-state/ErrorState";
import FrameworkSyncPanel from "@/components/passport/FrameworkSyncPanel";
import type { FrameworkSyncStatus } from "@lib/passport";
import { fetchFrameworkSync, startFrameworkSync } from "@lib/passport/api";

/** How often to ask how the run went, once one has started. */
export const POLL_MILLISECONDS = 30_000;

/** When to stop asking: well past the job's ten-minute limit. */
export const GIVE_UP_MILLISECONDS = 15 * 60_000;

/** Whether *status* holds a run that started after *pressedAt*. */
function finishedSince(
  status: FrameworkSyncStatus,
  pressedAt: number,
): boolean {
  const run = status.last_run;

  return run !== null && new Date(run.started_at).getTime() >= pressedAt;
}

export default function AdminPassportPage() {
  const [status, setStatus] = useState<FrameworkSyncStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAsking = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchFrameworkSync()
      .then((loaded) => {
        if (!cancelled) setStatus(loaded);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
      stopAsking();
    };
  }, [stopAsking]);

  async function handleSync() {
    // A little before the press, so a clock a second or two behind the
    // server's still counts the run this press started.
    const pressedAt = Date.now() - 60_000;

    setStarting(true);
    setRefusal(null);

    try {
      await startFrameworkSync();
      setStarted(true);
    } catch (caught) {
      // The server's own words: "not set up here" is something an
      // operator can act on, and "please try again" would hide it.
      const said = caught instanceof Error ? caught.message.trim() : "";
      setRefusal(
        said !== ""
          ? said
          : "The framework sync could not be started. Please try again.",
      );
      return;
    } finally {
      setStarting(false);
    }

    stopAsking();
    const gaveUpAt = Date.now() + GIVE_UP_MILLISECONDS;

    timer.current = setInterval(() => {
      if (Date.now() > gaveUpAt) {
        stopAsking();
        setStarted(false);
        return;
      }

      fetchFrameworkSync()
        .then((latest) => {
          if (!finishedSince(latest, pressedAt)) return;

          stopAsking();
          setStatus(latest);
          setStarted(false);
        })
        // A dropped answer is asked again at the next tick.
        .catch(() => undefined);
    }, POLL_MILLISECONDS);
  }

  if (loadFailed) {
    return (
      <ErrorState message="The framework sync could not be loaded. Please try again." />
    );
  }

  return (
    <FrameworkSyncPanel
      status={status}
      loading={status === null}
      starting={starting}
      started={started}
      refusal={refusal}
      onSync={() => void handleSync()}
    />
  );
}
