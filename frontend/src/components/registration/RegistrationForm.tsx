/**
 * RegistrationForm Component
 *
 * New user registration form with username, email, password, and optional
 * organisation/site selection. Handles validation and API submission.
 */

import { Stack } from "@mantine/core";
import BaseCard from "@components/base-card/BaseCard";
import {
  EmailField,
  EMAIL_PATTERN,
  PasswordField,
  SelectField,
  TextField,
} from "@components/form";
import { Heading } from "@components/typography";
import StateMessage from "@components/message-cards/StateMessage";
import { IconWifiOff } from "@/components/icons/appIcons";
import { useConnectivity } from "@lib/connectivity";
import {
  Form,
  FormStatusNarrow,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import { Controller } from "react-hook-form";

export interface RegistrationFormData {
  username: string;
  fullName: string;
  email: string;
  password: string;
  organisation?: string;
}

interface RegistrationFormValues {
  username: string;
  fullName: string;
  email: string;
  password: string;
  confirm: string;
  organisation: string | null;
}

export interface RegistrationFormProps {
  /** Available organisations for the dropdown — omit to hide the field */
  organisations?: { value: string; label: string }[];
  /** Called when the form is submitted with valid data — should return a FormSubmitResult */
  onSubmit: (data: RegistrationFormData) => Promise<FormSubmitResult>;
}

function RegistrationFields({
  organisations,
}: {
  organisations?: { value: string; label: string }[];
}) {
  const { methods } = useFormContext();
  const { isOnline } = useConnectivity();

  return (
    <Stack>
      <Heading>Create an account</Heading>
      {!isOnline && (
        <StateMessage
          icon={<IconWifiOff />}
          title="Quill is offline"
          description="Please check your connection to register."
          colour="alert"
        />
      )}
      <TextField
        label="Full name"
        {...methods.register("fullName", { required: true })}
        placeholder="As it should appear on certificates"
        required
      />
      <TextField
        label="Username"
        {...methods.register("username", { required: true })}
        required
      />
      <EmailField
        label="Email"
        {...methods.register("email", {
          required: true,
          pattern: EMAIL_PATTERN,
        })}
        required
      />
      {organisations && (
        <Controller
          name="organisation"
          control={methods.control}
          rules={{ required: true }}
          render={({ field }) => (
            <SelectField
              label="Organisation"
              placeholder="Select your organisation"
              data={organisations}
              value={field.value as string | null}
              onChange={field.onChange}
              required
              searchable
            />
          )}
        />
      )}
      <PasswordField
        label="Password"
        {...methods.register("password", { required: true })}
        required
        autoComplete="new-password"
      />
      <PasswordField
        label="Confirm password"
        {...methods.register("confirm", {
          required: true,
          validate: (value: string) =>
            value === methods.getValues("password") || "Passwords do not match",
        })}
        required
        autoComplete="new-password"
      />
      <FormStatusNarrow />
      <SubmitButton />
    </Stack>
  );
}

export default function RegistrationForm({
  organisations,
  onSubmit,
}: RegistrationFormProps) {
  async function handleSubmit(
    data: RegistrationFormValues,
  ): Promise<FormSubmitResult> {
    return onSubmit({
      username: data.username.trim(),
      fullName: data.fullName.trim(),
      email: data.email.trim(),
      password: data.password,
      ...(data.organisation ? { organisation: data.organisation } : {}),
    });
  }

  return (
    <BaseCard maw={480} mx="auto" mt="xl">
      <Form<RegistrationFormValues>
        defaultValues={{
          username: "",
          fullName: "",
          email: "",
          password: "",
          confirm: "",
          organisation: null,
        }}
        onSubmit={handleSubmit}
        submitLabel="Register"
        submittingLabel="Registering…"
      >
        <RegistrationFields organisations={organisations} />
      </Form>
    </BaseCard>
  );
}
