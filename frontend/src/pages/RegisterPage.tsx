/**
 * Registration Page Module
 *
 * Joining a teaching module, on one page with up to three views. The
 * first asks for the module and a clinical lead's email, and checks the
 * lead. A lead who holds the post at several sites brings up the second,
 * which asks which site; most delegates never see it. The last is the
 * account form. One request is sent at the end, naming the module, the
 * lead and the site, and the server checks the site is the lead's.
 *
 * Nothing is kept between the views but this page's own state, so a
 * refresh shows the first view again. Back keeps the module and the
 * lead's email, and loses what was typed into the account form. A clinical deployment has no
 * self-registration and is sent to sign in.
 */

// Auth pages use centred form layout, not Container

import { Center, Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import { QuillLogo } from "@components/images";
import BaseCard from "@components/base-card/BaseCard";
import { SelectField, TextField } from "@components/form";
import RadioField from "@components/form/RadioField";
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

/** One site the clinical lead's email admits a delegate to. */
interface LeadSite {
  site_id: number;
  site_name: string;
  org_unit_id: number;
}

/** What the clinical lead check answers. */
interface LeadCheck {
  valid: boolean;
  /** Every site the lead holds. Absent from a server not yet updated. */
  sites?: LeadSite[];
  site_name: string | null;
  org_unit_id: number | null;
  site_id: number | null;
}

/**
 * The sites a check found. A server from before `sites` names one site
 * in the single fields, which is read as a list of one.
 */
function sitesOf(result: LeadCheck): LeadSite[] {
  if (!result.valid) return [];
  if (result.sites) return result.sites;
  if (result.site_id == null || result.org_unit_id == null) return [];
  return [
    {
      site_id: result.site_id,
      site_name: result.site_name ?? "",
      org_unit_id: result.org_unit_id,
    },
  ];
}

/** The module and lead that were checked, and the sites that lead holds. */
interface Checked extends TeachingRegisterFormValues {
  sites: LeadSite[];
}

function ChooseSiteFields({
  sites,
  onBack,
}: {
  sites: LeadSite[];
  onBack: () => void;
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
        name="site"
        control={methods.control}
        rules={{ required: "Please choose a site" }}
        render={({ field, fieldState }) => (
          <RadioField
            label="Which site are you joining?"
            description="Your clinical lead covers more than one site."
            options={sites.map((site) => ({
              value: String(site.site_id),
              label: site.site_name,
            }))}
            value={(field.value as string) || null}
            onChange={field.onChange}
            error={fieldState.error?.message}
            required
          />
        )}
      />
      <SubmitButton onCancel={onBack} cancelLabel="Back" />
    </Stack>
  );
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

  // What was last typed into the first view, so Back finds it as it was.
  const [entry, setEntry] = useState<TeachingRegisterFormValues>({
    module: "",
    clinicalLeadEmail: "",
  });
  // Null until a clinical lead has been checked: the first view.
  const [checked, setChecked] = useState<Checked | null>(null);
  // The site being joined. Set at once for a lead at one site, and by
  // the second view for a lead at several.
  const [site, setSite] = useState<LeadSite | null>(null);

  async function checkClinicalLead(
    data: TeachingRegisterFormValues,
  ): Promise<FormSubmitResult> {
    try {
      const result = await api.post<LeadCheck>(
        "/teaching/public/validate-clinical-lead",
        { email: data.clinicalLeadEmail, bank_id: data.module },
      );

      // No site means nobody to join: an unknown lead, or one whose
      // organisation does not offer the module. Registration would refuse
      // them once the whole form was filled in, so say so here.
      const sites = sitesOf(result);
      if (sites.length === 0) {
        return {
          state: "error",
          message: {
            title: "Clinical lead not found",
            description:
              "The clinical lead that you entered is not registered at Quill Teaching. Please contact your local lead to organise onboarding for the above teaching module.",
          },
        };
      }

      setEntry(data);
      setSite(sites.length === 1 ? (sites[0] ?? null) : null);
      setChecked({ ...data, sites });
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

  async function chooseSite(data: { site: string }): Promise<FormSubmitResult> {
    const chosen = checked?.sites.find(
      (candidate) => String(candidate.site_id) === data.site,
    );
    if (!chosen) {
      return { state: "error", message: { title: "Please choose a site" } };
    }
    setSite(chosen);
    return { state: "success", message: { title: "Site chosen" } };
  }

  /** Back to the first view, with the module and the lead still there. */
  function startAgain() {
    setSite(null);
    setChecked(null);
  }

  async function register(
    data: RegistrationFormData,
    { module, clinicalLeadEmail }: Checked,
    joining: LeadSite,
  ): Promise<FormSubmitResult> {
    try {
      await api.post("/auth/register", {
        username: data.username,
        full_name: data.fullName || undefined,
        email: data.email,
        password: data.password,
        // No organisation: the server works it out from the lead. The
        // site is the delegate's choice where the lead holds several,
        // and the server refuses one that is not the lead's.
        teaching_module_id: module,
        clinical_lead_email: clinicalLeadEmail,
        site_id: joining.site_id,
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

  if (checked && site) {
    return (
      <RegistrationForm
        onSubmit={(data) => register(data, checked, site)}
        guidePath={guidePath("join-a-course")}
        siteName={site.site_name}
        // To the view before: the choice of site if there was one.
        onBack={checked.sites.length > 1 ? () => setSite(null) : startAgain}
      />
    );
  }

  if (checked) {
    return (
      <Center mih="100dvh">
        <BaseCard w={400}>
          {/* Keyed, as the first view's form is: both sit at the same
              place in the tree, and without a key React hands one the
              other's fields when the view changes. */}
          <Form<{ site: string }>
            key="choose-site"
            defaultValues={{ site: "" }}
            onSubmit={chooseSite}
            submitLabel="Continue"
            submittingLabel="Continuing…"
          >
            <ChooseSiteFields sites={checked.sites} onBack={startAgain} />
          </Form>
        </BaseCard>
      </Center>
    );
  }

  return (
    <Center mih="100dvh">
      <BaseCard w={400}>
        <Form<TeachingRegisterFormValues>
          key="clinical-lead"
          defaultValues={entry}
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
