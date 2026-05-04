import { PasswordInput, type PasswordInputProps } from "@mantine/core";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-text)",
    marginBottom: "0.25rem",
  },
  input: {
    fontSize: "var(--mantine-font-size-lg)",
    "&::placeholder": { color: "var(--mantine-color-placeholder)" },
  },
  required: { color: "var(--mantine-color-secondary-5)" },
  visibilityToggle: { color: "var(--mantine-color-text)" },
};

export default function PasswordField(props: PasswordInputProps) {
  return <PasswordInput {...props} size="lg" styles={fieldStyles} />;
}
