/**
 * LoginForm Component
 *
 * User login form with username, password, and optional TOTP fields.
 * Displays connectivity warnings and handles authentication via the API.
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@components/base-card/BaseCard";
import { PasswordField, TextField } from "@components/form";
import { QuillLogo } from "@components/images";
import { Heading, TextLink } from "@components/typography";
import StateMessage from "@components/message-cards/StateMessage";
import { IconWifiOff } from "@/components/icons/appIcons";
import { useConnectivity } from "@lib/connectivity";
import {
  Form,
  FormStatusNarrow,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";

export interface LoginFormData {
  username: string;
  password: string;
  totp?: string;
}

interface LoginFormValues {
  username: string;
  password: string;
  totp: string;
}

export interface LoginFormProps {
  /** Called when the form is submitted — should return a FormSubmitResult */
  onSubmit: (data: LoginFormData) => Promise<FormSubmitResult>;
  /** Whether to show the TOTP input */
  requireTotp?: boolean;
  /** Path for the register link (set to null to hide) */
  registerPath?: string | null;
  /** Path for the forgot password link (set to null to hide) */
  forgotPasswordPath?: string | null;
  /** Heading text displayed above the form */
  title?: string;
}

function LoginFields({
  requireTotp,
  registerPath,
  forgotPasswordPath,
  title,
}: {
  requireTotp: boolean;
  registerPath: string | null;
  forgotPasswordPath: string | null;
  title: string;
}) {
  const { methods } = useFormContext();
  const { isOnline } = useConnectivity();

  return (
    <Stack>
      <Heading>{title}</Heading>
      {!isOnline && (
        <StateMessage
          icon={<IconWifiOff />}
          title="Quill is offline"
          description="Please check your connection to log in."
          colour="alert"
        />
      )}
      <TextField
        label="Username"
        {...methods.register("username", { required: true })}
        required
        autoComplete="username"
      />
      <PasswordField
        label="Password"
        {...methods.register("password", { required: true })}
        required
        autoComplete="current-password"
      />
      {forgotPasswordPath && (
        <Group justify="flex-end">
          <TextLink to={forgotPasswordPath}>Forgot password?</TextLink>
        </Group>
      )}
      {requireTotp && (
        <TextField
          label="Authenticator code"
          {...methods.register("totp", { required: true })}
          required
          autoComplete="one-time-code"
          maxLength={6}
          inputMode="numeric"
        />
      )}
      <FormStatusNarrow />
      <SubmitButton />
      {registerPath && (
        <Group justify="flex-end">
          <TextLink to={registerPath}>
            Don&apos;t have an account? Register
          </TextLink>
        </Group>
      )}
    </Stack>
  );
}

export default function LoginForm({
  onSubmit,
  requireTotp = false,
  registerPath = "/register",
  forgotPasswordPath = "/forgot-password",
  title = "Sign in to Quill",
}: LoginFormProps) {
  async function handleSubmit(
    data: LoginFormValues,
  ): Promise<FormSubmitResult> {
    return onSubmit({
      username: data.username.trim(),
      password: data.password,
      totp: requireTotp ? data.totp : undefined,
    });
  }

  return (
    <>
      <Stack align="center" justify="center" mt="xl">
        <QuillLogo height={8} />
      </Stack>

      <BaseCard maw={380} mx="auto" mt="xl">
        <Form<LoginFormValues>
          defaultValues={{ username: "", password: "", totp: "" }}
          onSubmit={handleSubmit}
          submitLabel="Sign in"
          submittingLabel="Signing in…"
        >
          <LoginFields
            requireTotp={requireTotp}
            registerPath={registerPath ?? null}
            forgotPasswordPath={forgotPasswordPath ?? null}
            title={title}
          />
        </Form>
      </BaseCard>
    </>
  );
}
