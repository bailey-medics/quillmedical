/**
 * Teaching Register Page
 *
 * Registration form for teaching module users. Redirects to /teaching
 * after successful registration.
 */

// Auth pages use centred form layout, not Container

import { api } from "@/lib/api";
import { guidePath } from "@/guides/registry";
import type { FormSubmitResult } from "@/components/form/Form";
import { registrationError } from "@/lib/auth/registrationError";
import {
  RegistrationForm,
  type RegistrationFormData,
} from "@components/registration";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

interface LocationState {
  organisationId?: number | null;
  siteId?: number | null;
}

export default function TeachingRegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState) || {};
  // The module whose join link this is. Registering through it enrols
  // the person on that module, so they arrive able to open it.
  const { module } = useParams<{ module: string }>();

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
        teaching_module_id: module,
        // Always sent, ticked or not: an answer of "not ticked" is what
        // says the person was shown the question.
        marketing_opt_out: data.marketingOptOut,
      });

      navigate("/verify-email-pending", { state: { email: data.email } });
      return { state: "success", message: { title: "Account created" } };
    } catch (err: unknown) {
      return { state: "error", message: registrationError(err) };
    }
  }

  // Where they belong comes from the step before, which checked their
  // clinical lead, and it is held only in the router's state. A refresh,
  // a bookmark or a link opened in a new tab arrives without it, and the
  // API would refuse the registration once the whole form was filled in.
  // So go back to the first step, which says what it needs, with no
  // message: there is nothing to explain that the step does not show.
  if (state.organisationId == null) {
    return <Navigate to="/register" replace />;
  }

  return (
    <RegistrationForm
      onSubmit={handleSubmit}
      guidePath={guidePath("join-a-course")}
    />
  );
}
