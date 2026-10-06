/**
 * VerifyEmail Component
 *
 * The card shown when somebody follows the link in a verification
 * email. It has three states: the token is being checked, it was
 * accepted, or it was refused. The page owns the request and passes
 * the state in, so each state can be shown on its own.
 */

import { Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import BaseCard from "@components/base-card/BaseCard";
import { IconAlertCircle, IconClock } from "@components/icons/appIcons";
import { QuillLogo } from "@components/images";
import { ResultMessage, StateMessage } from "@components/message-cards";
import { BodyText, TextLink } from "@components/typography";

export type VerifyEmailStatus = "loading" | "success" | "error";

export interface VerifyEmailProps {
  /** Where the verification request has got to */
  status: VerifyEmailStatus;
}

export default function VerifyEmail({ status }: VerifyEmailProps) {
  return (
    <>
      <Stack align="center" justify="center" mt="xl">
        <QuillLogo height={8} />
      </Stack>

      <BaseCard maw={380} mx="auto" mt="xl">
        <Stack>
          <PageHeader title="Verify your email" />
          {status === "loading" && (
            <StateMessage
              icon={<IconClock />}
              title="Verifying your email…"
              description="Please wait while we verify your email address."
              colour="info"
            />
          )}
          {status === "success" && (
            <>
              <ResultMessage variant="success" title="Email verified" />
              <BodyText>
                Your email has been verified. You can now log in.
              </BodyText>
              <Group justify="flex-end">
                <TextLink standalone to="/login">
                  Go to login
                </TextLink>
              </Group>
            </>
          )}
          {status === "error" && (
            <>
              <StateMessage
                icon={<IconAlertCircle />}
                title="Verification failed"
                description="This link is invalid or has expired. Sign in with your username and password and we will email you a new one."
                colour="alert"
              />
              {/* To the login form, not to the page that offers to resend:
                  that page draws its button only when it knows the
                  address, and arriving from here it does not. Signing in
                  with an unverified account sends a fresh link by itself. */}
              <Group justify="flex-end">
                <TextLink standalone to="/login">
                  Sign in for a new link
                </TextLink>
              </Group>
            </>
          )}
        </Stack>
      </BaseCard>
    </>
  );
}
