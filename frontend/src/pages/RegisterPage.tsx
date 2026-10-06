/**
 * Registration Page Module
 *
 * Joining a teaching module, on one page with two views. The first asks
 * for the module and a clinical lead's email, and checks the lead. The
 * second is the account form. One request is sent at the end, naming the
 * module and the lead and no site: the server works the site out.
 *
 * Nothing is kept between the views but this page's own state, so a
 * refresh shows the first view again. A clinical deployment has no
 * self-registration and is sent to sign in.
 */

// Auth pages use centred form layout, not Container

import { Center, Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import { QuillLogo } from "@components/images";
import BaseCard from "@components/base-card/BaseCard";
import { SelectField, TextField } from "@components/form";
import { TextLink } from "@components/typography";
import { guidePath } from "@/guides/registry";
import { api } from "@/lib/api";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import { registrationError } from "@/lib/auth/registrationError";
import {
  RegistrationForm,
  type RegistrationFormData,
} from "@components/registration";
import { useEffect, useState } from "react";
import { Controller } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";

interface TeachingRegisterFormValues {
  module: string;
  clinicalLeadEmail: string;
}

/** What the first view found out, which the second sends with the account. */
type Joining = TeachingRegisterFormValues;

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
        <PageHeader title="Register for Quill Teaching" />
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
      {/* This is the step people stall at: it asks for somebody else's
          email address and does not say why. The guide does. */}
      <Group justify="flex-end">
        <TextLink standalone to={guidePath("join-a-course")}>
          How to join a course
        </TextLink>
      </Group>
    </Stack>
  );
}

function TeachingRegisterPage() {
  const navigate = useNavigate();
  const [modules, setModules] = useState<{ value: string; label: string }[]>(
    [],
  );

  useEffect(() => {
    api
      .get<{ modules: { value: string; label: string }[] }>(
        "/teaching/public/modules",
      )
      .then((data) => {
        setModules(data.modules);
      })
      .catch(() => {
        setModules([]);
      });
  }, []);

  // Null until a clinical lead has been checked: the first view. Then the
  // module and the lead the second view registers with.
  const [joining, setJoining] = useState<Joining | null>(null);

  async function checkClinicalLead(
    data: TeachingRegisterFormValues,
  ): Promise<FormSubmitResult> {
    try {
      const result = await api.post<{
        valid: boolean;
        site_name: string | null;
        org_unit_id: number | null;
        site_id: number | null;
      }>("/teaching/public/validate-clinical-lead", {
        email: data.clinicalLeadEmail,
        bank_id: data.module,
      });

      // A lead at a site whose organisation does not offer the module
      // comes back valid with no organisation. Registration would refuse
      // them once the whole form was filled in, so say so here.
      if (!result.valid || result.org_unit_id == null) {
        return {
          state: "error",
          message: {
            title: "Clinical lead not found",
            description:
              "The clinical lead that you entered is not registered at Quill Teaching. Please contact your local lead to organise onboarding for the above teaching module.",
          },
        };
      }

      setJoining(data);
      return {
        state: "success",
        message: { title: "Clinical lead found" },
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

  async function register(
    data: RegistrationFormData,
    { module, clinicalLeadEmail }: Joining,
  ): Promise<FormSubmitResult> {
    try {
      await api.post("/auth/register", {
        username: data.username,
        full_name: data.fullName || undefined,
        email: data.email,
        password: data.password,
        // No organisation and no site: the server works both out from
        // these two, and would not take the browser's word for them.
        teaching_module_id: module,
        clinical_lead_email: clinicalLeadEmail,
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

  if (joining) {
    return (
      <RegistrationForm
        onSubmit={(data) => register(data, joining)}
        guidePath={guidePath("join-a-course")}
      />
    );
  }

  return (
    <Center mih="100dvh">
      <BaseCard w={400}>
        <Form<TeachingRegisterFormValues>
          defaultValues={{ module: "", clinicalLeadEmail: "" }}
          onSubmit={checkClinicalLead}
          submitLabel="Continue"
          submittingLabel="Validating…"
        >
          <TeachingRegisterFields modules={modules} />
        </Form>
      </BaseCard>
    </Center>
  );
}

export default function RegisterPage() {
  if (import.meta.env.VITE_CLINICAL_SERVICES_ENABLED === "false") {
    return <TeachingRegisterPage />;
  }
  // Clinical environments do not allow self-registration
  return <Navigate to="/login" replace />;
}
