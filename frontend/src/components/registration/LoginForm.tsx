import { Group, Paper, Stack } from "@mantine/core";
import { PasswordField, TextField } from "@components/form";
import { QuillLogo } from "@components/images";
import { Heading, TextLink } from "@components/typography";
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
}

function LoginFields({
  requireTotp,
  registerPath,
  forgotPasswordPath,
}: {
  requireTotp: boolean;
  registerPath: string | null;
  forgotPasswordPath: string | null;
}) {
  const { methods } = useFormContext();
  const username = methods.watch("username") as string;
  const password = methods.watch("password") as string;
  const totp = methods.watch("totp") as string;

  return (
    <Stack>
      <Heading>Sign in to Quill</Heading>
      <TextField
        label="Username"
        value={username}
        onChange={(e) =>
          methods.setValue("username", e.currentTarget.value, {
            shouldDirty: true,
          })
        }
        required
        autoComplete="username"
      />
      <PasswordField
        label="Password"
        value={password}
        onChange={(e) =>
          methods.setValue("password", e.currentTarget.value, {
            shouldDirty: true,
          })
        }
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
          value={totp}
          onChange={(e) =>
            methods.setValue("totp", e.currentTarget.value, {
              shouldDirty: true,
            })
          }
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

      <Paper maw={380} mx="auto" p="lg" mt="xl" radius="md" withBorder>
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
          />
        </Form>
      </Paper>
    </>
  );
}
