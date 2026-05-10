import { Paper, Stack } from "@mantine/core";
import {
  EmailField,
  EMAIL_PATTERN,
  PasswordField,
  SelectField,
  TextField,
} from "@components/form";
import { Heading } from "@components/typography";
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
  organisation: string;
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
  /** Available organisations for the dropdown */
  organisations: { value: string; label: string }[];
  /** Called when the form is submitted with valid data — should return a FormSubmitResult */
  onSubmit: (data: RegistrationFormData) => Promise<FormSubmitResult>;
}

function RegistrationFields({
  organisations,
}: {
  organisations: { value: string; label: string }[];
}) {
  const { methods } = useFormContext();

  return (
    <Stack>
      <Heading>Create an account</Heading>
      <TextField
        label="Username"
        {...methods.register("username", { required: true })}
        required
      />
      <TextField
        label="Full name"
        {...methods.register("fullName")}
        placeholder="As it should appear on certificates"
      />
      <EmailField
        label="Email"
        {...methods.register("email", {
          required: true,
          pattern: EMAIL_PATTERN,
        })}
        required
      />
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
      organisation: data.organisation!,
    });
  }

  return (
    <Paper maw={480} mx="auto" p="lg" mt="xl" radius="md" withBorder>
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
    </Paper>
  );
}
