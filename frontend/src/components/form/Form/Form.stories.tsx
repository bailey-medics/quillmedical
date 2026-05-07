/**
 * Form Storybook Stories
 *
 * Demonstrates the full Form wrapper with FormStatus and SubmitButton
 * working together via context.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { BodyText } from "@/components/typography";
import { Form, FormStatus, SubmitButton, useFormContext } from "./index";
import type { FormSubmitResult } from "./Form";
import TextField from "../TextField";
import TextAreaField from "../TextAreaField";
import PasswordField from "../PasswordField";
import SelectField from "../SelectField";
import MultiSelectField from "../MultiSelectField";
import SolidSwitch from "../SolidSwitch";
import RadioField from "../RadioField";

const meta: Meta<typeof Form> = {
  title: "Form/Form",
  component: Form,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof Form>;

interface DemoFormValues {
  name: string;
  isStaff: boolean;
  role: string;
}

interface PlaygroundFormValues {
  name: string;
  password: string;
  notes: string;
  isStaff: boolean;
  role: string;
  priority: string;
  tags: string[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Success — form submits and shows a success status card
 */
export const SuccessSubmission: Story = {
  render: function SuccessStory() {
    const handleSubmit = async (): Promise<FormSubmitResult> => {
      await delay(1000);
      return {
        state: "success",
        message: {
          title: "Settings saved",
          description: "Your changes have been applied.",
        },
      };
    };

    return (
      <Form<DemoFormValues>
        defaultValues={{ name: "Dr Smith", isStaff: false, role: "clinician" }}
        onSubmit={handleSubmit}
        submitLabel="Save"
        submittingLabel="Saving…"
        disableWhenClean
      >
        <Stack gap="md">
          <BodyText c="dimmed" fs="italic">
            Change a value, then press submit
          </BodyText>
          <FormStatus />
          <RegisteredName />
          <RegisteredStaff />
          <RegisteredRole />
          <SubmitButton onCancel={() => {}} />
        </Stack>
      </Form>
    );
  },
};

/**
 * Error — form submits and shows an error status card
 */
export const ErrorSubmission: Story = {
  render: function ErrorStory() {
    const handleSubmit = async (): Promise<FormSubmitResult> => {
      await delay(1000);
      return {
        state: "error",
        message: {
          title: "Failed to save",
          description: "The server returned an error.",
        },
      };
    };

    return (
      <Form<DemoFormValues>
        defaultValues={{ name: "Dr Smith", isStaff: false, role: "clinician" }}
        onSubmit={handleSubmit}
        submitLabel="Save"
        submittingLabel="Saving…"
        disableWhenClean
      >
        <Stack gap="md">
          <BodyText c="dimmed" fs="italic">
            Change a value, then press submit
          </BodyText>
          <FormStatus />
          <RegisteredName />
          <RegisteredStaff />
          <RegisteredRole />
          <SubmitButton onCancel={() => {}} />
        </Stack>
      </Form>
    );
  },
};

/**
 * Unexpected error — handler throws instead of returning a result.
 * Form catches it and shows the generic fallback message.
 */
export const UnexpectedError: Story = {
  render: function UnexpectedErrorStory() {
    const handleSubmit = async (): Promise<FormSubmitResult> => {
      await delay(1000);
      throw new Error("Network failure");
    };

    return (
      <Form<DemoFormValues>
        defaultValues={{ name: "Dr Smith", isStaff: false, role: "clinician" }}
        onSubmit={handleSubmit}
        submitLabel="Save"
        submittingLabel="Saving…"
        disableWhenClean
      >
        <Stack gap="md">
          <BodyText c="dimmed" fs="italic">
            Change a value, then press submit
          </BodyText>
          <FormStatus />
          <RegisteredName />
          <RegisteredStaff />
          <RegisteredRole />
          <SubmitButton onCancel={() => {}} />
        </Stack>
      </Form>
    );
  },
};

/**
 * Partial success — composite write with mixed outcomes
 */
export const PartialSuccessSubmission: Story = {
  render: function PartialStory() {
    const handleSubmit = async (): Promise<FormSubmitResult> => {
      await delay(1000);
      return {
        state: "partial_success",
        message: {
          title: "Partially saved",
          description:
            "Letter saved to patient record. Delivery to GP is still pending.",
        },
      };
    };

    return (
      <Form<DemoFormValues>
        defaultValues={{ name: "Dr Smith", isStaff: false, role: "clinician" }}
        onSubmit={handleSubmit}
        submitLabel="Send"
        submittingLabel="Sending…"
        disableWhenClean
      >
        <Stack gap="md">
          <BodyText c="dimmed" fs="italic">
            Change a value, then press submit
          </BodyText>
          <FormStatus />
          <RegisteredName />
          <RegisteredStaff />
          <RegisteredRole />
          <SubmitButton onCancel={() => {}} />
        </Stack>
      </Form>
    );
  },
};

/**
 * Timeout — form submission exceeds timeout
 */
export const TimeoutSubmission: Story = {
  render: function TimeoutStory() {
    const handleSubmit = async (): Promise<FormSubmitResult> => {
      // This will be aborted by the 2s timeout
      await delay(60_000);
      return {
        state: "success",
        message: { title: "Saved" },
      };
    };

    return (
      <Form<DemoFormValues>
        defaultValues={{ name: "Dr Smith", isStaff: false, role: "clinician" }}
        onSubmit={handleSubmit}
        submitLabel="Save"
        submittingLabel="Saving…"
        disableWhenClean
        timeoutMs={2000}
      >
        <Stack gap="md">
          <BodyText c="dimmed" fs="italic">
            Change a value, then press submit
          </BodyText>
          <FormStatus />
          <RegisteredName />
          <RegisteredStaff />
          <RegisteredRole />
          <SubmitButton onCancel={() => {}} />
        </Stack>
      </Form>
    );
  },
};

/**
 * Validation error — press submit with an invalid email to see the warning card
 * and inline field errors. Uses RHF validation so the onInvalid handler
 * triggers the validation_error state with amber styling.
 */
export const ValidationError: Story = {
  render: function ValidationErrorStory() {
    const handleSubmit = async (): Promise<FormSubmitResult> => {
      await delay(500);
      return {
        state: "success",
        message: { title: "Saved" },
      };
    };

    return (
      <Form<DemoFormValues>
        defaultValues={{
          name: "not-an-email",
          isStaff: false,
          role: "clinician",
        }}
        onSubmit={handleSubmit}
        submitLabel="Save"
        submittingLabel="Saving…"
        disableWhenClean
      >
        <Stack gap="md">
          <BodyText c="dimmed" fs="italic">
            Change a value, then press submit to see the validation warning
          </BodyText>
          <FormStatus />
          <ValidatedEmail />
          <RegisteredStaff />
          <RegisteredRole />
          <SubmitButton onCancel={() => {}} />
        </Stack>
      </Form>
    );
  },
};

/**
 * Dirty state playground — every atomic form field with disableWhenClean.
 * Toggle each field to verify the Save button enables/disables correctly.
 */
export const DirtyStatePlayground: Story = {
  render: function DirtyStateStory() {
    const handleSubmit = async (): Promise<FormSubmitResult> => {
      await delay(1000);
      return {
        state: "success",
        message: {
          title: "Saved",
          description: "Your changes have been applied.",
        },
      };
    };

    return (
      <Form<PlaygroundFormValues>
        defaultValues={{
          name: "Dr Smith",
          password: "",
          notes: "",
          isStaff: false,
          role: "clinician",
          priority: "normal",
          tags: [],
        }}
        onSubmit={handleSubmit}
        submitLabel="Save"
        submittingLabel="Saving…"
        disableWhenClean
      >
        <Stack gap="md">
          <BodyText c="dimmed" fs="italic">
            Change any field — Save should enable. Revert all — Save should
            disable.
          </BodyText>
          <FormStatus />
          <RegisteredName />
          <RegisteredPassword />
          <RegisteredNotes />
          <RegisteredStaff />
          <RegisteredRole />
          <RegisteredPriority />
          <RegisteredTags />
          <SubmitButton onCancel={() => {}} />
        </Stack>
      </Form>
    );
  },
};

/* RHF-registered field wrappers for the stories */
function RegisteredName() {
  const { methods } = useFormContext();
  const { register } = methods;
  return <TextField label="Name" {...register("name")} />;
}

function RegisteredStaff() {
  const { methods } = useFormContext();
  const { watch, setValue } = methods;
  const checked = watch("isStaff") as boolean;
  return (
    <SolidSwitch
      label="Staff"
      checked={checked}
      onChange={(e) =>
        setValue("isStaff", e.currentTarget.checked, { shouldDirty: true })
      }
    />
  );
}

function RegisteredRole() {
  const { methods } = useFormContext();
  const { watch, setValue } = methods;
  const value = watch("role") as string | null;
  return (
    <SelectField
      label="Role"
      value={value}
      onChange={(v) => setValue("role", v as string, { shouldDirty: true })}
      data={[
        { value: "clinician", label: "Clinician" },
        { value: "admin", label: "Admin" },
        { value: "staff", label: "Staff" },
      ]}
    />
  );
}

function RegisteredPassword() {
  const { methods } = useFormContext();
  const { register } = methods;
  return <PasswordField label="Password" {...register("password")} />;
}

function RegisteredNotes() {
  const { methods } = useFormContext();
  const { register } = methods;
  return <TextAreaField label="Notes" {...register("notes")} />;
}

function RegisteredPriority() {
  const { methods } = useFormContext();
  const { watch, setValue } = methods;
  const value = watch("priority") as string | null;
  return (
    <RadioField
      label="Priority"
      value={value}
      onChange={(v) => setValue("priority", v, { shouldDirty: true })}
      options={[
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
      ]}
    />
  );
}

function RegisteredTags() {
  const { methods } = useFormContext();
  const { watch, setValue } = methods;
  const value = watch("tags") as string[];
  return (
    <MultiSelectField
      label="Tags"
      value={value}
      onChange={(v) => setValue("tags", v, { shouldDirty: true })}
      data={[
        { value: "urgent", label: "Urgent" },
        { value: "follow-up", label: "Follow-up" },
        { value: "review", label: "Review" },
      ]}
    />
  );
}

/** Email field wired to RHF validation — shows inline error for invalid email */
function ValidatedEmail() {
  const { methods } = useFormContext();
  const {
    register,
    formState: { errors },
  } = methods;
  return (
    <TextField
      label="Email"
      {...register("name", {
        required: "Email is required",
        pattern: {
          value: /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/,
          message: "Please enter a valid email address",
        },
      })}
      error={errors.name?.message as string | undefined}
    />
  );
}
