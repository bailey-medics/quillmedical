/**
 * Passport Sign-Off Page
 *
 * One sign-off in full, and the form for signing it.
 *
 * The passport id is not in the route: an assessor reaching this page
 * knows the sign-off id from their inbox, and the API resolves which
 * passport it belongs to from the request row naming them. That keeps
 * the URL from implying an assessor may address a passport directly.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import SignOffCard from "@/components/passport/SignOffCard";
import SignOffForm from "@/components/passport/SignOffForm";
import ErrorState from "@/components/error-state/ErrorState";
import { fetchInbox, signOff as submitSignOff } from "@lib/passport";
import type { SignOff, SignOffInput } from "@lib/passport";

export function Component() {
  const { signOffId } = useParams<{ signOffId: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<SignOff | null>(null);
  const passportId: string | null = null;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // The inbox is the only list an assessor may read, and it carries
    // the sign-off in full, so there is nothing further to fetch.
    fetchInbox()
      .then((requests) => {
        if (cancelled) return;
        const found = requests.find((request) => request.id === signOffId);
        if (found) {
          setRecord(found);
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
    if (!record || passportId === null) {
      setError("This request cannot be signed from here yet.");
      return;
    }

    setSubmitting(true);
    try {
      await submitSignOff(passportId, record.id, data);
      navigate("/passport/inbox");
    } catch {
      setError("The sign-off could not be saved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Sign off" />

      {error && <ErrorState message={error} />}

      {record && (
        <>
          <SignOffCard signOff={record} />
          <SignOffForm
            signOff={record}
            onSubmit={handleSignOff}
            onCancel={() => navigate("/passport/inbox")}
            isSubmitting={submitting}
          />
        </>
      )}
    </Stack>
  );
}
