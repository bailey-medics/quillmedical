import { Button, Group, Paper, Stack } from "@mantine/core";
import { useState } from "react";
import { PasswordField, TextField } from "@components/form";
import { QuillLogo } from "@components/images";
import { ErrorText, HeaderText, HyperlinkText } from "@components/typography";

export interface LoginFormData {
  username: string;
  password: string;
  totp?: string;
}

export interface LoginFormProps {
  /** Called when the form is submitted */
  onSubmit: (data: LoginFormData) => void;
  /** Whether the form is currently submitting */
  submitting?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Whether to show the TOTP input */
  requireTotp?: boolean;
  /** Path for the register link (set to null to hide) */
  registerPath?: string | null;
}

export default function LoginForm({
  onSubmit,
  submitting = false,
  error = null,
  requireTotp = false,
  registerPath = "/register",
}: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      username: username.trim(),
      password,
      totp: requireTotp ? totp : undefined,
    });
  }

  return (
    <>
      <Stack align="center" justify="center" mt="xl">
        <QuillLogo height={8} />
      </Stack>

      <Paper maw={380} mx="auto" p="lg" mt="xl" radius="md" withBorder>
        <form onSubmit={handleSubmit} noValidate>
          <Stack>
            <HeaderText>Sign in to Quill</HeaderText>
            <TextField
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              required
              autoComplete="username"
            />
            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
              autoComplete="current-password"
            />
            {requireTotp && (
              <TextField
                label="Authenticator code"
                value={totp}
                onChange={(e) => setTotp(e.currentTarget.value)}
                required
                autoComplete="one-time-code"
                maxLength={6}
                inputMode="numeric"
              />
            )}
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" loading={submitting} size="lg">
              Sign in
            </Button>
            {registerPath && (
              <Group justify="flex-end">
                <HyperlinkText to={registerPath}>
                  Don&apos;t have an account? Register
                </HyperlinkText>
              </Group>
            )}
          </Stack>
        </form>
      </Paper>
    </>
  );
}
