/**
 * Passport Accept Invite Page
 *
 * What an assessor's invitation link opens.
 *
 * **Reading an invitation is not accepting it.** The preview may be
 * fetched as often as the assessor likes for the whole fourteen days, so
 * somebody who opens the link between clinics and closes the tab can
 * come back to it. Only completing the form consumes the invitation.
 *
 * Outside `RequireAuth` and outside `RequireFeature`: the person opening
 * it may have no Quill account at all, and the signed token in the URL
 * stands in for a session.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import { PasswordField, TextField } from "@components/form";
import ButtonPair from "@/components/button/ButtonPair";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconCircleCheck, IconInfoCircle } from "@/components/icons/appIcons";
import { BodyText } from "@/components/typography";
import { acceptAssessorInvite, previewAssessorInvite } from "@lib/passport";
import type { InvitePreview } from "@lib/passport";

export function Component() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [registrationBody, setRegistrationBody] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingToken = !token;

  // Step 6 of the flow: the link lands them where the work is, rather
  // than telling them to go and find it. A short pause so the
  // confirmation is read rather than flashed past, and a button beside
  // it for anyone who looked away or whose browser blocked the move.
  useEffect(() => {
    if (!accepted) return;

    const timer = setTimeout(() => navigate("/passport/inbox"), 2000);
    return () => clearTimeout(timer);
  }, [accepted, navigate]);

  useEffect(() => {
    if (missingToken) return;

    let cancelled = false;

    previewAssessorInvite(token)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        if (!cancelled) {
          setError("This invitation could not be opened. It may have expired.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, missingToken]);

  async function handleAccept() {
    if (!token) return;

    setSubmitting(true);
    try {
      await acceptAssessorInvite({
        token,
        username: preview?.needs_account ? username : null,
        password: preview?.needs_account ? password : null,
        // Stated by the assessor rather than copied from the
        // invitation: the holder gave an address and nothing else, and
        // a registration number is worth more from its holder than
        // from somebody who half-remembered it.
        full_name: preview?.needs_account ? fullName.trim() : null,
        registration_authority: preview?.needs_account
          ? registrationBody.trim()
          : null,
        registration_number: preview?.needs_account
          ? registrationNumber.trim()
          : null,
      });
      setAccepted(true);
      setError(null);
    } catch {
      setError("The invitation could not be accepted. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = preview?.needs_account
    ? username.trim().length > 0 &&
      password.length > 0 &&
      fullName.trim().length > 0 &&
      registrationBody.trim().length > 0 &&
      registrationNumber.trim().length > 0 &&
      !submitting
    : !submitting;

  if (accepted) {
    return (
      <Stack gap="lg" p="lg">
        <StateMessage
          icon={<IconCircleCheck />}
          title="Invitation accepted"
          description="Taking you to the sign-off requests waiting for you."
          colour="success"
        />
        <ButtonPair
          acceptLabel="See my sign-off requests"
          onAccept={() => navigate("/passport/inbox")}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="lg" p="lg">
      <PageHeader title="Assessor invitation" />

      {missingToken && (
        <ErrorState message="This link is missing its invitation code." />
      )}
      {error && <ErrorState message={error} />}

      {preview?.already_accepted && (
        <StateMessage
          icon={<IconInfoCircle />}
          title="Already accepted"
          description="This invitation has done its job. Sign in to see the requests naming you."
        />
      )}

      {preview && !preview.already_accepted && (
        <BaseCard>
          <Stack gap="md">
            <BodyText>
              {preview.holder_name} has asked you to assess them. The invitation
              was sent to {preview.email}.
            </BodyText>

            {preview.needs_account && (
              <>
                <TextField
                  label="Your full name"
                  description="As it should read on the sign-offs you make."
                  value={fullName}
                  onChange={(event) => setFullName(event.currentTarget.value)}
                  required
                />
                <TextField
                  label="Registering body"
                  description="GMC, NMC, HCPC or whichever holds your registration."
                  value={registrationBody}
                  onChange={(event) =>
                    setRegistrationBody(event.currentTarget.value)
                  }
                  required
                />
                <TextField
                  label="Registration number"
                  description="Recorded on every sign-off you make, and checked by an administrator later."
                  value={registrationNumber}
                  onChange={(event) =>
                    setRegistrationNumber(event.currentTarget.value)
                  }
                  required
                />
                <TextField
                  label="Choose a username"
                  value={username}
                  onChange={(event) => setUsername(event.currentTarget.value)}
                  required
                />
                <PasswordField
                  label="Choose a password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  autoComplete="new-password"
                  required
                />
              </>
            )}

            <ButtonPair
              acceptLabel="Accept invitation"
              acceptDisabled={!canSubmit}
              acceptLoading={submitting}
              onAccept={handleAccept}
            />
          </Stack>
        </BaseCard>
      )}
    </Stack>
  );
}
