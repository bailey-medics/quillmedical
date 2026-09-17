/**
 * Passport Inbox Page
 *
 * The caller's open sign-off requests, as an assessor.
 *
 * **This is the one passport page an external assessor reaches.** They
 * see exactly the requests naming them and nothing else — not the
 * holder's passport, not other holders. The API resolves that from
 * `passport_signoff_request` rows, so no extra gate is needed here.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import SignOffCard from "@/components/passport/SignOffCard";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import { UnstyledButton } from "@mantine/core";
import { fetchInbox } from "@lib/passport";
import type { InboxItem } from "@lib/passport";

export function Component() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchInbox()
      .then((result) => {
        if (!cancelled) setRequests(result);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your inbox could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Stack gap="lg">
      <PageHeader title="Sign-off requests" />

      {error && <ErrorState message={error} />}

      {!loading && requests.length === 0 && (
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="Nothing waiting"
          description="Requests appear here when somebody asks you to assess them."
        />
      )}

      {requests.map((item) => (
        <UnstyledButton
          key={item.sign_off.id}
          onClick={() => navigate(`/passport/sign-off/${item.sign_off.id}`)}
          aria-label={item.sign_off.competency.name}
        >
          <SignOffCard signOff={item.sign_off} />
        </UnstyledButton>
      ))}
    </Stack>
  );
}
