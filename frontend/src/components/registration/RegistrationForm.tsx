import { Paper, Stack } from "@mantine/core";
import { PasswordField, SelectField, TextField } from "@components/form";
import { Heading } from "@components/typography";
import {
  Form,
  FormStatusNarrow,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";

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
  const username = methods.watch("username") as string;
  const fullName = methods.watch("fullName") as string;
  const email = methods.watch("email") as string;
  const password = methods.watch("password") as string;
  const confirm = methods.watch("confirm") as string;
  const organisation = methods.watch("organisation") as string | null;

  return (
    <Stack>
      <Heading>Create an account</Heading>
      <TextField
        label="Username"
        value={username}
        onChange={(e) =>
          methods.setValue("username", e.currentTarget.value, {
            shouldDirty: true,
          })
        }
        required
      />
      <TextField
        label="Full name"
        value={fullName}
        onChange={(e) =>
          methods.setValue("fullName", e.currentTarget.value, {
            shouldDirty: true,
          })
        }
        placeholder="As it should appear on certificates"
      />
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) =>
          methods.setValue("email", e.currentTarget.value, {
            shouldDirty: true,
          })
        }
        required
        autoComplete="email"
      />
      <SelectField
        label="Organisation"
        placeholder="Select your organisation"
        data={organisations}
        value={organisation}
        onChange={(v) =>
          methods.setValue("organisation", v, { shouldDirty: true })
        }
        required
        searchable
      />
      <PasswordField
        label="Password"
        value={password}
        onChange={(e) =>
          methods.setValue("password", e.currentTarget.value, {
            shouldDirty: true,
          })
        }
        required
        autoComplete="new-password"
      />
      <PasswordField
        label="Confirm password"
        value={confirm}
        onChange={(e) =>
          methods.setValue("confirm", e.currentTarget.value, {
            shouldDirty: true,
          })
        }
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
    if (data.password !== data.confirm) {
      return {
        state: "validation_error",
        message: { title: "Passwords do not match" },
      };
    }

    if (!data.organisation) {
      return {
        state: "validation_error",
        message: { title: "Please select an organisation" },
      };
    }

    return onSubmit({
      username: data.username.trim(),
      fullName: data.fullName.trim(),
      email: data.email.trim(),
      password: data.password,
      organisation: data.organisation,
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
