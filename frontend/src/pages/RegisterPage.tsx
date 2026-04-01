/**
 * Registration Page Module
 *
 * User registration page for creating new accounts. Delegates form rendering
 * to the RegistrationForm component and handles API submission and navigation.
 */

/* eslint-disable no-restricted-syntax */
// Auth pages use centred form layout, not Container

import { api } from "@/lib/api";
import {
  RegistrationForm,
  type RegistrationFormData,
} from "@components/registration";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

interface Organisation {
  id: number;
  name: string;
}

export default function RegisterPage() {
  const { login } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organisations, setOrganisations] = useState<
    { value: string; label: string }[]
  >([]);

  useEffect(() => {
    fetch("/api/auth/organizations")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { organizations: Organisation[] }) => {
        setOrganisations(
          data.organizations.map((o) => ({
            value: String(o.id),
            label: o.name,
          })),
        );
      })
      .catch(() => {
        /* organisations will remain empty if the endpoint is unavailable */
      });
  }, []);

  async function handleSubmit(data: RegistrationFormData) {
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/auth/register", {
        username: data.username,
        full_name: data.fullName || undefined,
        email: data.email,
        password: data.password,
        organisation_id: Number(data.organisation),
      });

      // Auto-login with the credentials just registered
      const user = await login(data.username, data.password);

      // Redirect based on deployment mode
      if (!user.clinical_services_enabled) {
        window.location.assign("/teaching");
      } else {
        const rawBase = (import.meta.env.BASE_URL as string) || "/";
        const base = rawBase.endsWith("/") ? rawBase : rawBase + "/";
        window.location.assign(base);
      }
    } catch (err: unknown) {
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
    <RegistrationForm
      organisations={organisations}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
    />
  );
}
