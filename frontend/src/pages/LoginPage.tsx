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
  // Use Vite BASE_URL as the absolute SPA base (may or may not include a
  // trailing slash). Normalize to ensure trailing slash and use it for
  // full browser navigation when appropriate.
  const rawBase = (import.meta.env.BASE_URL as string) || "/";
  const base = rawBase.endsWith("/") ? rawBase : rawBase + "/";
  const redirectFrom = location.state?.from?.pathname;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      // If the user was trying to reach the app home (router path "/") or
      // there is no 'from' path, perform a full navigation to Vite's
      // BASE_URL (which usually includes a trailing slash, e.g. '/app/').
      // This prevents the router basename from producing URLs like '/app'
      // without the trailing slash. For other paths (e.g. '/about') we
      // navigate internally so the user returns to the exact protected page.
      if (!redirectFrom || redirectFrom === "/") {
        window.location.assign(base);
      } else {
        navigate(redirectFrom, { replace: true });
      }
    } catch (err: unknown) {
      function extractMessage(e: unknown): string | null {
        if (typeof e === "string") return e;
        if (typeof e === "object" && e !== null) {
          const maybe = (e as Record<string, unknown>)["message"];
          if (typeof maybe === "string") return maybe;
        }
        return null;
      }

      const message = extractMessage(err) ?? "Login failed";
      setError(message);
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
