import { Button, Paper, Stack } from "@mantine/core";
import { useState } from "react";
import { PasswordField, SelectField, TextField } from "@components/form";
import { ErrorText, HeaderText } from "@components/typography";

export interface RegistrationFormData {
  username: string;
  email: string;
  password: string;
  organisation: string;
}

export interface RegistrationFormProps {
  /** Available organisations for the dropdown */
  organisations: { value: string; label: string }[];
  /** Called when the form is submitted with valid data */
  onSubmit: (data: RegistrationFormData) => void;
  /** Whether the form is currently submitting */
  submitting?: boolean;
  /** Error message to display */
  error?: string | null;
}

export default function RegistrationForm({
  organisations,
  onSubmit,
  submitting = false,
  error = null,
}: RegistrationFormProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [organisation, setOrganisation] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (password !== confirm) {
      setLocalError("Passwords do not match");
      return;
    }

    if (!organisation) {
      setLocalError("Please select an organisation");
      return;
    }

    onSubmit({
      username: username.trim(),
      email: email.trim(),
      password,
      organisation,
    });
  }

  const displayError = error ?? localError;

  return (
    <Paper maw={480} mx="auto" p="lg" mt="xl" radius="md" withBorder>
      <form onSubmit={handleSubmit} noValidate>
        <Stack>
          <HeaderText>Create an account</HeaderText>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            required
          />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
            autoComplete="email"
          />
          <SelectField
            label="Organisation"
            placeholder="Select your organisation"
            data={organisations}
            value={organisation}
            onChange={setOrganisation}
            required
            searchable
          />
          <PasswordField
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
            required
            autoComplete="new-password"
          />
          {displayError && <ErrorText>{displayError}</ErrorText>}
          <Button type="submit" loading={submitting} size="lg">
            Register
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
