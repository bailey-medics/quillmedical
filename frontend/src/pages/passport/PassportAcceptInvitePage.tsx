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
import { PasswordField, SelectField, TextField } from "@components/form";
import ButtonPair from "@/components/button/ButtonPair";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconCircleCheck, IconInfoCircle } from "@/components/icons/appIcons";
import { BodyText, BodyTextInline } from "@/components/typography";
import {
  acceptAssessorInvite,
  previewAssessorInvite,
  registrationAuthorities,
} from "@lib/passport";
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

  // Step 6 of the flow, as far as it can go here: registering creates
  // an account but not a session, so `/passport/inbox` would bounce
  // straight off `RequireAuth` to the login page anyway. Going there
  // directly, carrying the confirmation, says what happened and what to
  // do next in one move rather than two.
  useEffect(() => {
    if (!accepted) return;

    const timer = setTimeout(
      () =>
        navigate("/login", {
          state: {
            notice:
              "Your account is ready. Sign in to see the sign-off requests waiting for you.",
          },
        }),
      2000,
    );
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
          description="Taking you to sign in."
          colour="success"
        />
        <ButtonPair
          acceptLabel="Sign in"
          onAccept={() =>
            navigate("/login", {
              state: {
                notice:
                  "Your account is ready. Sign in to see the sign-off requests waiting for you.",
              },
            })
          }
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
              You have been asked by{" "}
              <BodyTextInline bold>{preview.holder_name}</BodyTextInline> to
              sign off{" "}
              {preview.competency_name ? (
                <>
                  a{" "}
                  <BodyTextInline bold>
                    {preview.competency_name}
                  </BodyTextInline>{" "}
                  competency.
                </>
              ) : (
                "a competency."
              )}
            </BodyText>

            {/* Why a form at all. Somebody arriving from an email has
                not asked for an account and will reasonably wonder why
                they are being made to create one, so the page says what
                it is for and that it happens once. */}
            {preview.needs_account ? (
              <BodyText>
                For governance, you first need to register. Please do so below.
              </BodyText>
            ) : (
              <BodyText>
                You already use Quill, so there is nothing to set up. Accepting
                puts this request with any others waiting for you.
              </BodyText>
            )}

            {preview.needs_account && (
              <>
                <TextField
                  label="Your full name"
                  description="As it should read on the sign-offs you make."
                  value={fullName}
                  onChange={(event) => setFullName(event.currentTarget.value)}
                  required
                />
                <SelectField
                  label="Registering body"
                  description="The body that holds your registration."
                  placeholder="Choose one"
                  data={registrationAuthorities()}
                  value={registrationBody || null}
                  onChange={(value) => setRegistrationBody(value ?? "")}
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
