/**
 * Teaching Register Page
 *
 * Registration form for teaching module users. Redirects to /teaching
 * after successful registration.
 */

// Auth pages use centred form layout, not Container

import { api } from "@/lib/api";
import type { FormSubmitResult } from "@/components/form/Form";
import { registrationError } from "@/lib/auth/registrationError";
import {
  RegistrationForm,
  type RegistrationFormData,
} from "@components/registration";
import { useLocation, useNavigate } from "react-router-dom";

interface LocationState {
  organisationId?: number | null;
  siteId?: number | null;
}

export default function TeachingRegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState) || {};

  async function handleSubmit(
    data: RegistrationFormData,
  ): Promise<FormSubmitResult> {
    try {
      await api.post("/auth/register", {
        username: data.username,
        full_name: data.fullName || undefined,
        email: data.email,
        password: data.password,
        org_unit_id: state.organisationId ?? undefined,
        site_id: state.siteId ?? undefined,
      });

      navigate("/verify-email-pending", { state: { email: data.email } });
      return { state: "success", message: { title: "Account created" } };
    } catch (err: unknown) {
      return { state: "error", message: registrationError(err) };
    }
  }

  return <RegistrationForm onSubmit={handleSubmit} />;
}
