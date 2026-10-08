/**
 * Passport Sign-Off Page
 *
 * One sign-off in full, and the form for signing it.
 *
 * The passport id is not in the route: an assessor reaching this page
 * knows the sign-off id from their inbox, and the passport's list of
 * requests says which passport each belongs to. That keeps the URL from
 * implying an assessor may address a passport directly - they may reach
 * exactly the requests naming them, which is what that list returns.
 *
 * Reached from `/inbox`, the page of everything waiting on somebody, and
 * it goes back there. The passport had a queue page of its own,
 * `/passport/inbox`, until 4 October 2026.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import SignOffCard from "@/components/passport/SignOffCard";
import SignOffForm from "@/components/passport/SignOffForm";
import ErrorState from "@/components/error-state/ErrorState";
import { INBOX_PATH, inboxChanged } from "@/lib/inbox/inbox";
import { fetchInbox, signOff as submitSignOff } from "@lib/passport";
import type { InboxItem, SignOffInput } from "@lib/passport";

export function Component() {
  const { signOffId } = useParams<{ signOffId: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<InboxItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // The inbox is the only list an assessor may read, and it carries
    // the sign-off in full alongside the passport it belongs to, so
    // there is nothing further to fetch.
    fetchInbox()
      .then((requests) => {
        if (cancelled) return;
        const found = requests.find(
          (request) => request.sign_off.id === signOffId,
        );
        if (found) {
          setItem(found);
        } else {
          setError("That request is not in your inbox.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("That request could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [signOffId]);

  async function handleSignOff(data: SignOffInput) {
    if (!item) return;

    setSubmitting(true);
    try {
      // `name`, not `id`. The route keys on the folder name inside the
      // repository, which is what the request row stores and what the
      // inbox returns as `sign_off.name`. `id` is the record's own
      // identifier and matches no row, so posting it was a 404 every
      // time.
      await submitSignOff(item.passport_id, item.sign_off.name, data);
      // One fewer thing is waiting, so the envelope is told at once.
      inboxChanged();
      navigate(INBOX_PATH);
    } catch (caught) {
      // The server's own words where it gave any: it refuses for
      // reasons an assessor can act on, and "please try again" hides
      // them.
      const said = caught instanceof Error ? caught.message.trim() : "";
      setError(
        said !== ""
          ? said
          : "The sign-off could not be saved. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Sign off" />

      {error && <ErrorState message={error} />}

      {item && (
        <>
          <SignOffCard signOff={item.sign_off} />
          <SignOffForm
            signOff={item.sign_off}
            onSubmit={handleSignOff}
            onCancel={() => navigate(INBOX_PATH)}
            isSubmitting={submitting}
          />
        </>
      )}
    </Stack>
  );
}
