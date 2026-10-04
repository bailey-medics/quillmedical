/**
 * VerifyEmailPending Component
 *
 * The card shown after registering, telling somebody to check their
 * email for a verification link. Offers to send the link again when
 * the address is known. The page owns the request and passes the
 * state in.
 */

import { Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import BaseCard from "@components/base-card/BaseCard";
import IconTextButton from "@components/button/IconTextButton";
import { QuillLogo } from "@components/images";
import { ResultMessage } from "@components/message-cards";
import { BodyText, TextLink } from "@components/typography";

export interface VerifyEmailPendingProps {
  /** Address the link was sent to; empty when it is not known */
  email: string;
  /** Whether the link has been sent again */
  resent: boolean;
  /** Whether a resend is in flight */
  loading: boolean;
  /** Called when the resend button is pressed */
  onResend: () => void;
}

export default function VerifyEmailPending({
  email,
  resent,
  loading,
  onResend,
}: VerifyEmailPendingProps) {
  return (
    <>
      <Stack align="center" justify="center" mt="xl">
        <QuillLogo height={8} />
      </Stack>

      <BaseCard maw={380} mx="auto" mt="xl">
        <Stack>
          <PageHeader title="Check your email" />
          <BodyText>
            We&apos;ve sent a verification link to{" "}
            {email ? <strong>{email}</strong> : "your email address"}. Please
            click the link to activate your account.
          </BodyText>
          <BodyText c="dimmed">
            The link expires in 60 minutes. Check your spam folder if you
            don&apos;t see it.
          </BodyText>
          {email && !resent && (
            <IconTextButton
              icon="refresh"
              label="Resend verification email"
              onClick={onResend}
              loading={loading}
              variant="light"
            />
          )}
          {resent && (
            <ResultMessage
              variant="success"
              title="Verification email resent"
            />
          )}
          <Group justify="flex-end">
            <TextLink standalone to="/login">
              Back to login
            </TextLink>
          </Group>
        </Stack>
      </BaseCard>
    </>
  );
}
