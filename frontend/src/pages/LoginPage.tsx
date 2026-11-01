/**
 * Login Page Module
 *
 * User authentication page with username/password login and optional TOTP
 * two-factor authentication. Delegates form rendering to LoginForm component
 * and handles auth context integration, error parsing, and redirection.
 */

// Auth pages use centred form layout, not Container

import { LoginForm, type LoginFormData } from "@components/registration";
import { guidePath } from "@/guides/registry";
import type { FormSubmitResult } from "@/components/form/Form";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stack } from "@mantine/core";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconCircleCheck } from "@/components/icons/appIcons";
import { useAuth } from "../auth/AuthContext";
import { isCompetencyId, SCOPED_MANAGER_IDS } from "@/types/cbac";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [requireTotp, setRequireTotp] = useState(false);

  const location = useLocation() as {
    state?: { from?: Location; notice?: string };
  };
  const rawBase = import.meta.env.BASE_URL || "/";
  const base = rawBase.endsWith("/") ? rawBase : rawBase + "/";
  const redirectFrom = location.state?.from?.pathname;

  // Set by a page that sent somebody here having just done something
  // that worked. An assessor who has only this moment registered has
  // no session yet, so saying "your account is ready" beside the form
  // is the difference between arriving and feeling bounced.
  const notice = location.state?.notice;

  async function handleSubmit(data: LoginFormData): Promise<FormSubmitResult> {
    try {
      const user = await login(data.username, data.password, data.totp);

      // Safety net: don't redirect to admin paths if the user cannot use
      // them - prevents PHI leakage across login sessions. Asks the
      // competency the `/admin` guard asks, so the two cannot disagree.
      const canAdminister =
        user.competencies?.some(
          (c) =>
            c === "manage_users" ||
            (isCompetencyId(c) && SCOPED_MANAGER_IDS.includes(c)),
        ) ?? false;
      const canRedirect =
        redirectFrom &&
        redirectFrom !== "/" &&
        (!redirectFrom.startsWith("/admin") || canAdminister);

      // Otherwise to `/`, which lands them on the first link in their
      // side navigation - see `HomeRedirect`.
      if (canRedirect) {
        window.location.assign(redirectFrom);
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
          if (typeof obj["message"] === "string") return obj["message"];
          if (typeof obj["detail"] === "string") return obj["detail"];
          const detail = obj["detail"];
          if (detail && typeof detail === "object") {
            const d = detail as Record<string, unknown>;
            if (typeof d["message"] === "string") return d["message"];
            if (typeof d["detail"] === "string") return d["detail"];
          }
          if (typeof obj["error_code"] === "string")
            return obj["error_code"].replace(/_/g, " ");
          try {
            return JSON.stringify(obj);
          } catch {
            // A body that cannot be serialised has no message to give
            return null;
          }
        }
        return null;
      }

      const message = extractMessage(err) ?? "Login failed";
      const errObj = err as Error & { error_code?: string; status?: number };
      const code = errObj.error_code;

      const invalidCodeRegex = /invalid two[ -]?factor code|invalid code/i;
      const requiresTwoFactorRegex = /two[ -]?factor|two[ -]?factor required/i;

      let errorMessage: string;

      if (errObj.status === 429) {
        // The rate limit's answer carries no message of its own, so
        // without this the page showed the browser's status text, or
        // "HTTP 429" over HTTP/2.
        errorMessage =
          "Too many sign-in attempts. Please wait a minute, then try again.";
      } else if (code === "email_not_verified") {
        const email = (errObj as unknown as Record<string, unknown>).email as
          string | undefined;
        navigate("/verify-email-pending", { state: { email } });
        return {
          state: "error",
          message: { title: "Please verify your email first" },
        };
      } else if (code === "totp_locked") {
        // Too many wrong codes in a row. The message says how long to
        // wait; keep the code field so they can try again after it.
        setRequireTotp(true);
        errorMessage = message;
      } else if (code === "invalid_totp") {
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

  const isClinical = import.meta.env.VITE_CLINICAL_SERVICES_ENABLED !== "false";

  const title = isClinical
    ? "Sign in to Quill Medical"
    : "Sign in to Quill Teaching";

  return (
    <Stack gap="lg">
      {notice !== undefined && (
        <StateMessage
          icon={<IconCircleCheck />}
          title="Registration complete"
          description={notice}
          colour="success"
        />
      )}
      <LoginForm
        onSubmit={handleSubmit}
        requireTotp={requireTotp}
        registerPath={isClinical ? null : "/register"}
        // Offered with the register link: where nobody registers for
        // themselves there is nothing to explain.
        guidePath={isClinical ? null : guidePath("join-a-course")}
        title={title}
      />
    </Stack>
  );
}
