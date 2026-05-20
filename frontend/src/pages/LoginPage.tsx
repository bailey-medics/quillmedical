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
import type { FormSubmitResult } from "@/components/form/Form";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [requireTotp, setRequireTotp] = useState(false);

  const location = useLocation() as { state?: { from?: Location } };
  const rawBase = (import.meta.env.BASE_URL as string) || "/";
  const base = rawBase.endsWith("/") ? rawBase : rawBase + "/";
  const redirectFrom = location.state?.from?.pathname;

  async function handleSubmit(data: LoginFormData): Promise<FormSubmitResult> {
    try {
      const user = await login(data.username, data.password, data.totp);

      // Safety net: don't redirect to admin paths if the user lacks
      // admin permissions — prevents PHI leakage across login sessions.
      const isAdmin =
        user.system_permissions === "admin" ||
        user.system_permissions === "superadmin";
      const canRedirect =
        redirectFrom &&
        redirectFrom !== "/" &&
        (!redirectFrom.startsWith("/admin") || isAdmin);

      if (canRedirect) {
        window.location.assign(redirectFrom);
      } else if (!user.clinical_services_enabled) {
        window.location.assign("/teaching");
      } else {
        window.location.assign(base);
      }
      return { state: "success", message: { title: "Signed in" } };
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

      let errorMessage: string;

      if (code === "invalid_totp") {
        setRequireTotp(true);
        errorMessage = requireTotp
          ? "Wrong code entered, please try entering your 6-digit authenticator code again"
          : "Enter the 6-digit authenticator code";
      } else if (code === "two_factor_required") {
        setRequireTotp(true);
        errorMessage = "Enter the 6-digit authenticator code";
      } else {
        const invalidCode = invalidCodeRegex.test(message);
        const requiresTwoFactor = requiresTwoFactorRegex.test(message);
        if (invalidCode) {
          setRequireTotp(true);
          errorMessage = requireTotp
            ? "Wrong code entered, please try entering your 6-digit authenticator code again"
            : "Enter the 6-digit authenticator code";
        } else if (requiresTwoFactor) {
          setRequireTotp(true);
          errorMessage = "Enter the 6-digit authenticator code";
        } else {
          errorMessage = message;
        }
      }

      return {
        state: "error",
        message: { title: errorMessage },
      };
    }
  }

  const title =
    import.meta.env.VITE_CLINICAL_SERVICES_ENABLED === "false"
      ? "Sign in to Quill Teaching"
      : "Sign in to Quill Medical";

  return (
    <LoginForm
      onSubmit={handleSubmit}
      requireTotp={requireTotp}
      title={title}
    />
  );
}
