import {
  Button,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: Location } };
  const redirectTo = location.state?.from?.pathname || "/app";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <img
        src="/app/quill-logo.png"
        alt="Quill Medical Logo"
        style={{
          width: "128px",
          height: "128px",
          display: "block",
          margin: "0 auto",
          marginTop: "30px",
        }}
      />

      <Paper maw={380} mx="auto" p="lg" mt="xl" radius="md" withBorder>
        <form onSubmit={onSubmit}>
          <Stack>
            <Title order={3}>Sign in to Quill</Title>
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
              autoComplete="current-password"
            />
            {error && <div style={{ color: "crimson" }}>{error}</div>}
            <Button
              type="submit"
              loading={submitting}
              disabled={!email || !password}
            >
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </>
  );
}
