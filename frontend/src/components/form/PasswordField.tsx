import { PasswordInput, type PasswordInputProps } from "@mantine/core";
import { ErrorMessage } from "@components/typography";
import FieldDescription from "@components/typography/FieldDescription";
import classes from "./PasswordField.module.css";

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

export default function PasswordField({
  description,
  error,
  ...props
}: PasswordInputProps) {
  return (
    <PasswordInput
      {...props}
      description={
        description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : undefined
      }
      error={error ? <ErrorMessage>{error}</ErrorMessage> : undefined}
      size="lg"
      styles={fieldStyles}
      classNames={{ root: classes.root }}
    />
  );
}
