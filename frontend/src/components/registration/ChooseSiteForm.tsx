/**
 * ChooseSiteForm Component
 *
 * The registration step that asks which site a delegate is joining. It
 * shows only where the clinical lead they named holds the post at more
 * than one site; most delegates never see it.
 */

import { Stack } from "@mantine/core";
import { Controller } from "react-hook-form";
import BaseCard from "@components/base-card/BaseCard";
import RadioField from "@components/form/RadioField";
import { QuillLogo } from "@components/images";
import PageHeader from "@/components/page-header";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";

export interface ChooseSiteFormProps {
  /** The clinical lead's sites, to choose from */
  sites: { value: string; label: string }[];
  /** Called with the chosen site's value */
  onSubmit: (site: string) => FormSubmitResult | Promise<FormSubmitResult>;
  /** Goes back to the step before */
  onBack: () => void;
}

function ChooseSiteFields({
  sites,
  onBack,
}: Pick<ChooseSiteFormProps, "sites" | "onBack">) {
  const { methods } = useFormContext<{ site: string }>();

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
            options={sites}
            value={field.value || null}
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

export default function ChooseSiteForm({
  sites,
  onSubmit,
  onBack,
}: ChooseSiteFormProps) {
  return (
    <BaseCard w={400}>
      <Form<{ site: string }>
        defaultValues={{ site: "" }}
        onSubmit={(data) => onSubmit(data.site)}
        submitLabel="Continue"
        submittingLabel="Continuing…"
      >
        <ChooseSiteFields sites={sites} onBack={onBack} />
      </Form>
    </BaseCard>
  );
}
