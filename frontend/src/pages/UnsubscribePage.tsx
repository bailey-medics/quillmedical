/**
 * Unsubscribe Page
 *
 * Where the unsubscribe link in a newsletter leads. The link carries a
 * signed token, which is all that says whose preference this is: the
 * person may be signed out, so there is no guard on this route.
 *
 * Reads the preference, and changes it when the switch is used.
 * Delegates rendering to Unsubscribe.
 */

// Auth pages use the logo-and-card layout of the sign-in forms, not Container

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Unsubscribe, type UnsubscribeStatus } from "@components/registration";

/** What the unsubscribe link's routes answer. */
interface UnsubscribeAnswer {
  /** The address the link is for, with most of it hidden */
  email: string;
  /** Whether they are sent news and updates */
  marketing_emails: boolean;
}

/** The HTTP status an error from `api` carries, if it carries one. */
function statusOf(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) {
    return undefined;
  }
  return typeof err.status === "number" ? err.status : undefined;
}

/**
 * Whether the server refused the link itself: not a real one (404), or
 * not a token at all (422). Anything else is the request not arriving.
 */
function linkRefused(err: unknown): boolean {
  const status = statusOf(err);
  return status === 404 || status === 422;
}

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<UnsubscribeStatus>(
    token ? "loading" : "invalid",
  );
  const [email, setEmail] = useState<string | undefined>();
  const [wantsNews, setWantsNews] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const path = `/marketing/unsubscribe?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;

    api
      .get<UnsubscribeAnswer>(path)
      .then((answer) => {
        if (cancelled) return;
        setEmail(answer.email);
        setWantsNews(answer.marketing_emails);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus(linkRefused(err) ? "invalid" : "unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [token, path]);

  async function change(wants: boolean) {
    // A second press while the first is still saving is dropped, as on
    // the Settings switch.
    if (saving) return;
    setError(undefined);
    setSaved(false);
    setWantsNews(wants);
    setSaving(true);
    try {
      const answer = await api.post<UnsubscribeAnswer>(path, {
        wants_marketing: wants,
      });
      setEmail(answer.email);
      setWantsNews(answer.marketing_emails);
      setSaved(true);
    } catch (err: unknown) {
      if (linkRefused(err)) {
        setStatus("invalid");
        return;
      }
      // Put it back: what the switch shows must be what is saved.
      setWantsNews(!wants);
      setError("We could not save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Unsubscribe
      status={status}
      email={email}
      wantsNews={wantsNews}
      saving={saving}
      saved={saved}
      error={error}
      onChange={(wants) => void change(wants)}
    />
  );
}
