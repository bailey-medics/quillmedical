/**
 * Registration Page Module
 *
 * User registration page for creating new accounts. Delegates form rendering
 * to the RegistrationForm component and handles API submission and navigation.
 * Teaching environments show a placeholder pending bespoke registration flow.
 */

/* eslint-disable no-restricted-syntax */
// Auth pages use centred form layout, not Container

import { Button, Center, Group, Stack } from "@mantine/core";
import { Heading } from "@components/typography";
import { QuillLogo } from "@components/images";
import BaseCard from "@components/base-card/BaseCard";
import { SelectField, TextField } from "@components/form";
import { api } from "@/lib/api";
import type { FormSubmitResult } from "@/components/form/Form";
import {
  RegistrationForm,
  type RegistrationFormData,
} from "@components/registration";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";

const TEACHING_MODULES = [
  {
    value: "colonoscopy-optical-diagnosis-test",
    label: "Colonoscopy optical diagnosis test",
  },
  {
    value: "chest-xray-interpretation-test",
    label: "Chest x-ray interpretation test",
  },
];

const VALID_CLINICAL_LEADS = ["clinicallead@nhs.net"];

function TeachingRegisterPage() {
  const navigate = useNavigate();
  const [module, setModule] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    setError(null);
    if (!module) return;
    if (!VALID_CLINICAL_LEADS.includes(email.toLowerCase().trim())) {
      setError(
        "The clinical lead that you entered is not registered at Quill Teaching. Please contact your local lead to organise onboarding for the above teaching module.",
      );
      return;
    }
    navigate(`/teaching/register/${module}`);
  }

  return (
    <Center mih="100dvh">
      <BaseCard w={400}>
        <Stack gap="md">
          <Stack align="center" gap="md">
            <QuillLogo />
            <Heading>Register for Quill Teaching</Heading>
          </Stack>
          <SelectField
            label="Teaching module"
            placeholder="Select a module"
            data={TEACHING_MODULES}
            value={module}
            onChange={setModule}
          />
          <TextField
            label="Clinical lead email address"
            placeholder="clinicallead@nhs.net"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            error={error ?? undefined}
          />
          <Group justify="flex-end">
            <Button disabled={!module || !email} onClick={handleContinue}>
              Continue
            </Button>
          </Group>
        </Stack>
      </BaseCard>
    </Center>
  );
}

interface Organisation {
  id: number;
  name: string;
}

function ClinicalRegisterPage() {
  const { login } = useAuth();
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

  async function handleSubmit(
    data: RegistrationFormData,
  ): Promise<FormSubmitResult> {
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
      return { state: "success", message: { title: "Account created" } };
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
      return {
        state: "error",
        message: { title: msg },
      };
    }
  }

  return (
    <RegistrationForm organisations={organisations} onSubmit={handleSubmit} />
  );
}

export default function RegisterPage() {
  if (import.meta.env.VITE_CLINICAL_SERVICES_ENABLED === "false") {
    return <TeachingRegisterPage />;
  }
  return <ClinicalRegisterPage />;
}
