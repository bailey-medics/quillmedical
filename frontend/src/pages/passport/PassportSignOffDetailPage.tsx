/**
 * Passport Sign-off Detail Page
 *
 * One of the holder's own sign-offs in full, reached by choosing it on
 * the sign-offs page.
 *
 * Not the assessor's page at `/passport/sign-off/:signOffId`, which reads
 * the request through the assessor's inbox and carries the form for
 * signing it. This one is the holder's: it reads their own passport, and
 * its one action is theirs, withdrawing a request nobody has answered.
 * A withdrawn request is deleted rather than kept as declined, so the
 * page goes back to the list afterwards.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { useCallback, useEffect, useState } from "react";
import { Group, Stack } from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import IconTextButton from "@/components/button/IconTextButton";
import { ConfirmModal } from "@/components/confirm-modal";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import SignOffCard from "@/components/passport/SignOffCard";
import { IconFileText } from "@/components/icons/appIcons";
import { fetchMyPassport, fetchSignOff, withdrawSignOff } from "@lib/passport";
import type { SignOff } from "@lib/passport";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [passportId, setPassportId] = useState<string | null>(null);
  const [signOff, setSignOff] = useState<SignOff | null>(null);
  const [canWrite, setCanWrite] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(
    async (id: string) => {
      if (!name) return;
      try {
        setSignOff(await fetchSignOff(id, name));
      } catch {
        // The API answers 404 for a sign-off that is not in this
        // passport, and the client does not say which error it was, so
        // any failure here reads as "not here" rather than guessing.
        setMissing(true);
      }
    },
    [name],
  );

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (cancelled) return;
        const id = detail.passport.passport_id;
        setPassportId(id);
        setCanWrite(detail.entitlement?.can_write !== false);
        return load(id);
      })
      .catch(() => {
        if (!cancelled) {
          setError("That sign-off could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleWithdraw() {
    if (!passportId || !name) return;

    try {
      await withdrawSignOff(passportId, name);
      // Withdrawing removes the request from the passport, so there is
      // nothing left here to show.
      navigate("/passport/sign-offs");
    } catch (caught) {
      setError("The request could not be withdrawn. Please try again.");
      // Thrown on so the confirm modal stays open, as it expects.
      throw caught;
    }
  }

  if (missing) {
    return (
      <Stack gap="lg">
        <PageHeader title="Sign-off" />
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="That sign-off is not here"
          description="The link may be wrong, or it may belong to another passport."
        />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title={signOff?.competency.name ?? "Sign-off"} />

      {error && <ErrorState message={error} />}

      {/* Only while nobody has answered. A signed or declined sign-off
          is part of the record and stays there; correcting one is the
          assessor's act, not the holder's. */}
      {signOff?.status === "requested" && (
        <Group justify="flex-end">
          <IconTextButton
            icon="trash"
            label="Withdraw request"
            onClick={() => setWithdrawing(true)}
            disabled={!canWrite}
          />
        </Group>
      )}

      {signOff && <SignOffCard signOff={signOff} />}

      <ConfirmModal
        opened={withdrawing}
        onClose={() => setWithdrawing(false)}
        onAccept={handleWithdraw}
        title="Withdraw this request"
        acceptLabel="Withdraw"
        submittingLabel="Withdrawing…"
      >
        Your assessor will no longer be able to sign it off. You can ask again
        at any time.
      </ConfirmModal>
    </Stack>
  );
}
