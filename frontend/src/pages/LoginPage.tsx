import QuillLogo from "@/components/images/QuillLogo";
import {
  Anchor,
  Button,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [requireTotp, setRequireTotp] = useState(false);
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
      await login(email.trim(), password, requireTotp ? totp : undefined);
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
        if (e instanceof Error) {
          // Some Errors may carry an attached `error_code` (set by api helper)
          const anyErr = e as Error & { error_code?: string };
          if (anyErr.message && typeof anyErr.message === "string") {
            // message may itself be the string '[object Object]'; try to
            // detect and fall back to other fields below.
            if (anyErr.message !== "[object Object]") return anyErr.message;
          }
        }

        if (typeof e === "object" && e !== null) {
          const obj = e as Record<string, unknown>;
          // Common shapes: { message: string }, { detail: string },
          // { detail: { message: string, error_code: string } }
          if (typeof obj["message"] === "string")
            return obj["message"] as string;
          if (typeof obj["detail"] === "string") return obj["detail"] as string;
          const detail = obj["detail"];
          if (detail && typeof detail === "object") {
            const d = detail as Record<string, unknown>;
            if (typeof d["message"] === "string") return d["message"] as string;
            if (typeof d["detail"] === "string") return d["detail"] as string;
          }
          // If there is an error_code, show a readable fallback
          if (typeof obj["error_code"] === "string")
            return (obj["error_code"] as string).replace(/_/g, " ");
          // As a last resort, stringify the object so UI gets a useful value
          try {
            return JSON.stringify(obj);
          } catch {
            return String(obj);
          }
        }
        return null;
      }

      const message = extractMessage(err) ?? "Login failed";
      // Prefer structured error_code from the thrown Error when available.
      // Our API attaches `error_code` to the Error object for newer responses.
      const errObj = err as Error & { error_code?: string };
      const code = errObj.error_code;

      const invalidCodeRegex = /invalid two[ -]?factor code|invalid code/i;
      const requiresTwoFactorRegex = /two[ -]?factor|two[ -]?factor required/i;

      if (code === "invalid_totp") {
        if (requireTotp) {
          setRequireTotp(true);
          setError(
            "Wrong code entered, please try entering your 6-digit authenticator code again",
          );
        } else {
          setRequireTotp(true);
          setError("Enter the 6-digit authenticator code");
        }
      } else if (code === "two_factor_required") {
        setRequireTotp(true);
        setError("Enter the 6-digit authenticator code");
      } else {
        // Fallback to legacy message parsing
        const invalidCode = invalidCodeRegex.test(message);
        const requiresTwoFactor = requiresTwoFactorRegex.test(message);
        if (invalidCode) {
          if (requireTotp) {
            setRequireTotp(true);
            setError(
              "Wrong code entered, please try entering your 6-digit authenticator code again",
            );
          } else {
            setRequireTotp(true);
            setError("Enter the 6-digit authenticator code");
          }
        } else if (requiresTwoFactor) {
          setRequireTotp(true);
          setError("Enter the 6-digit authenticator code");
        } else {
          setError(message);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack align="center" justify="center" style={{ marginTop: "30px" }}>
        <QuillLogo height={128} />
      </Stack>

      <Paper maw={380} mx="auto" p="lg" mt="xl" radius="md" withBorder>
        <form onSubmit={onSubmit}>
          <Stack>
            <Title order={3}>Sign in to Quill</Title>
            <TextInput
              label="Username"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
              autoComplete="username"
            />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
              autoComplete="current-password"
            />
            {requireTotp && (
              <TextInput
                label="Authenticator code"
                value={totp}
                onChange={(e) => setTotp(e.currentTarget.value)}
                placeholder="123456"
                required
              />
            )}
            {error && <div style={{ color: "crimson" }}>{error}</div>}
            <Button
              type="submit"
              loading={submitting}
              disabled={!email || !password || (requireTotp && !totp)}
            >
              Sign in
            </Button>
            {/* Use router-relative path so react-router's basename is applied once */}
            <Anchor component={Link} to="/register">
              Create an account
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </>
  );
}
