/**
 * Registration Page Module
 *
 * User registration page for creating new accounts. Delegates form rendering
 * to the RegistrationForm component and handles API submission and navigation.
 * Teaching environments show a placeholder pending bespoke registration flow.
 */

/* eslint-disable no-restricted-syntax */
// Auth pages use centred form layout, not Container

import { Center, Stack } from "@mantine/core";
import { Heading } from "@components/typography";
import { QuillLogo } from "@components/images";
import BaseCard from "@components/base-card/BaseCard";
import { SelectField, TextField } from "@components/form";
import { api } from "@/lib/api";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import {
  RegistrationForm,
  type RegistrationFormData,
} from "@components/registration";
import { useEffect, useState } from "react";
import { Controller } from "react-hook-form";
import { useNavigate } from "react-router";

interface TeachingRegisterFormValues {
  module: string;
  clinicalLeadEmail: string;
}

function TeachingRegisterFields({
  modules,
}: {
  modules: { value: string; label: string }[];
}) {
  const { methods } = useFormContext();

  return (
    <Stack gap="md">
      <Stack align="center" gap="md">
        <QuillLogo />
        <Heading>Register for Quill Teaching</Heading>
      </Stack>
      <FormStatus />
      <Controller
        name="module"
        control={methods.control}
        rules={{ required: "Please select a module" }}
        render={({ field, fieldState }) => (
          <SelectField
            label="Teaching module"
            placeholder="Select a module"
            data={modules}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        name="clinicalLeadEmail"
        control={methods.control}
        rules={{ required: "Please enter your clinical lead's email" }}
        render={({ field, fieldState }) => (
          <TextField
            label="Clinical lead email address"
            placeholder={"clinicallead@nhs.net"}
            type="email"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <SubmitButton />
    </Stack>
  );
}

function TeachingRegisterPage() {
  const navigate = useNavigate();
  const [modules, setModules] = useState<{ value: string; label: string }[]>(
    [],
  );

  useEffect(() => {
    fetch("/api/teaching/public/modules")
      .then((res) => res.json())
      .then((data: { modules: { value: string; label: string }[] }) => {
        setModules(data.modules);
      })
      .catch(() => {
        setModules([]);
      });
  }, []);

  async function handleSubmit(
    data: TeachingRegisterFormValues,
  ): Promise<FormSubmitResult> {
    try {
      const result = await api.post<{
        valid: boolean;
        site_name: string | null;
        organisation_id: number | null;
        site_id: number | null;
      }>("/teaching/public/validate-clinical-lead", {
        email: data.clinicalLeadEmail,
        bank_id: data.module,
      });

      if (!result.valid) {
        return {
          state: "error",
          message: {
            title: "Clinical lead not found",
            description:
              "The clinical lead that you entered is not registered at Quill Teaching. Please contact your local lead to organise onboarding for the above teaching module.",
          },
        };
      }

      navigate(`/teaching/register/${data.module}`, {
        state: {
          organisationId: result.organisation_id,
          siteId: result.site_id,
        },
      });
      return {
        state: "success",
        message: { title: "Redirecting…" },
      };
    } catch {
      return {
        state: "error",
        message: {
          title: "Validation failed",
          description:
            "Unable to verify clinical lead. Please try again later.",
        },
      };
    }
  }

  return (
    <Center mih="100dvh">
      <BaseCard w={400}>
        <Form<TeachingRegisterFormValues>
          defaultValues={{ module: "", clinicalLeadEmail: "" }}
          onSubmit={handleSubmit}
          submitLabel="Continue"
          submittingLabel="Validating…"
        >
          <TeachingRegisterFields modules={modules} />
        </Form>
      </BaseCard>
    </Center>
  );
}

interface Organisation {
  id: number;
  name: string;
}

function ClinicalRegisterPage() {
  const navigate = useNavigate();
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

      navigate("/verify-email-pending", { state: { email: data.email } });
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
