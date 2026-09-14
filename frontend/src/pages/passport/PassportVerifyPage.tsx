/**
 * Passport Verify Page
 *
 * What the QR code on a printed passport opens: whether one sign-off
 * still matches its own fingerprint.
 *
 * The page needs both the passport id and the sign-off id, because a
 * reader arriving from paper has no session to resolve either from. Both
 * come from the URL the PDF encodes.
 *
 * It renders `VerificationPanel`, which shows what a match proves *and*
 * what it does not — the limits matter as much as the result.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useParams, useSearchParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import VerificationPanel from "@/components/passport/VerificationPanel";
import ErrorState from "@/components/error-state/ErrorState";
import { verifySignOff } from "@lib/passport";
import type { Verification } from "@lib/passport";

export function Component() {
  const { signOffId } = useParams<{ signOffId: string }>();
  const [searchParams] = useSearchParams();
  const passportId = searchParams.get("passport");

  const [verification, setVerification] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derived, not set in an effect: whether the link carries what it
  // needs is knowable at render time.
  const missingParams = !passportId || !signOffId;

  useEffect(() => {
    if (missingParams) return;

    let cancelled = false;

    verifySignOff(passportId, signOffId)
      .then((result) => {
        if (!cancelled) setVerification(result);
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "That record could not be checked. You may not have permission to read it.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [passportId, signOffId, missingParams]);

  return (
    <Stack gap="lg">
      <PageHeader title="Verify a sign-off" />

      {missingParams && (
        <ErrorState message="This link is missing the record it should check." />
      )}
      {error && <ErrorState message={error} />}

      {verification && <VerificationPanel verification={verification} />}
    </Stack>
  );
}
