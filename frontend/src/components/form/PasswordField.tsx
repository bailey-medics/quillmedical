import { PasswordInput, type PasswordInputProps } from "@mantine/core";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-black)",
    marginBottom: "0.25rem",
  },
  input: { fontSize: "var(--mantine-font-size-lg)" },
  visibilityToggle: { color: "var(--mantine-primary-color-filled)" },
};

export default function PasswordField(props: PasswordInputProps) {
  return <PasswordInput {...props} size="lg" styles={fieldStyles} />;
}
