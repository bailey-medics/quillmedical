import { api } from "@/lib/api";
import {
  Button,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      setSubmitting(false);
      return;
    }
    try {
      await api.post("/auth/register", {
        username: username.trim(),
        email: email.trim(),
        password,
      });
      // On success, navigate to login page
      navigate("/login", { replace: true });
    } catch (err: unknown) {
      // Reuse simple error extraction like LoginPage
      let msg = "Registration failed";
      if (err instanceof Error && err.message) msg = err.message;
      else if (typeof err === "object" && err !== null) {
        try {
          msg = JSON.stringify(err);
        } catch {
          msg = String(err);
        }
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Paper maw={480} mx="auto" p="lg" mt="xl" radius="md" withBorder>
      <form onSubmit={onSubmit}>
        <Stack>
          <Title order={3}>Create an account</Title>
          <TextInput
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            required
          />
          <TextInput
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
            autoComplete="email"
          />
          <PasswordInput
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
            autoComplete="new-password"
          />
          <PasswordInput
            label="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
            required
            autoComplete="new-password"
          />
          {error && <div style={{ color: "crimson" }}>{error}</div>}
          <Button type="submit" loading={submitting}>
            Register
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
