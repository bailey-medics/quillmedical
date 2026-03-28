/**
 * Login Page Module
 *
 * User authentication page with username/password login and optional TOTP
 * two-factor authentication. Delegates form rendering to LoginForm component
 * and handles auth context integration, error parsing, and redirection.
 */

/* eslint-disable no-restricted-syntax */
// Auth pages use centred form layout, not Container

import { LoginForm, type LoginFormData } from "@components/registration";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [requireTotp, setRequireTotp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const location = useLocation() as { state?: { from?: Location } };
  const rawBase = (import.meta.env.BASE_URL as string) || "/";
  const base = rawBase.endsWith("/") ? rawBase : rawBase + "/";
  const redirectFrom = location.state?.from?.pathname;

  async function handleSubmit(data: LoginFormData) {
    setSubmitting(true);
    setError(null);
    try {
      const user = await login(data.username, data.password, data.totp);
      if (redirectFrom && redirectFrom !== "/") {
        window.location.assign(redirectFrom);
      } else if (!user.clinical_services_enabled) {
        window.location.assign("/teaching");
      } else {
        window.location.assign(base);
      }
    } catch (err: unknown) {
      function extractMessage(e: unknown): string | null {
        if (typeof e === "string") return e;
        if (e instanceof Error) {
          const anyErr = e as Error & { error_code?: string };
          if (anyErr.message && typeof anyErr.message === "string") {
            if (anyErr.message !== "[object Object]") return anyErr.message;
          }
        }
        if (typeof e === "object" && e !== null) {
          const obj = e as Record<string, unknown>;
          if (typeof obj["message"] === "string")
            return obj["message"] as string;
          if (typeof obj["detail"] === "string") return obj["detail"] as string;
          const detail = obj["detail"];
          if (detail && typeof detail === "object") {
            const d = detail as Record<string, unknown>;
            if (typeof d["message"] === "string") return d["message"] as string;
            if (typeof d["detail"] === "string") return d["detail"] as string;
          }
          if (typeof obj["error_code"] === "string")
            return (obj["error_code"] as string).replace(/_/g, " ");
          try {
            return JSON.stringify(obj);
          } catch {
            return String(obj);
          }
        }
        return null;
      }

      const message = extractMessage(err) ?? "Login failed";
      const errObj = err as Error & { error_code?: string };
      const code = errObj.error_code;

      const invalidCodeRegex = /invalid two[ -]?factor code|invalid code/i;
      const requiresTwoFactorRegex = /two[ -]?factor|two[ -]?factor required/i;

      if (code === "invalid_totp") {
        setRequireTotp(true);
        setError(
          requireTotp
            ? "Wrong code entered, please try entering your 6-digit authenticator code again"
            : "Enter the 6-digit authenticator code",
        );
      } else if (code === "two_factor_required") {
        setRequireTotp(true);
        setError("Enter the 6-digit authenticator code");
      } else {
        const invalidCode = invalidCodeRegex.test(message);
        const requiresTwoFactor = requiresTwoFactorRegex.test(message);
        if (invalidCode) {
          setRequireTotp(true);
          setError(
            requireTotp
              ? "Wrong code entered, please try entering your 6-digit authenticator code again"
              : "Enter the 6-digit authenticator code",
          );
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
    <LoginForm
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      requireTotp={requireTotp}
    />
  );
}
