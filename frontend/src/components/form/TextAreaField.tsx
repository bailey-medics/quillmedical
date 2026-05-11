import { Textarea, type TextareaProps } from "@mantine/core";
import { ErrorMessage } from "@components/typography";
import FieldDescription from "@components/typography/FieldDescription";
import classes from "./TextAreaField.module.css";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-text)",
    marginBottom: "0.25rem",
  },
  input: {
    fontSize: "var(--mantine-font-size-lg)",
    fontWeight: 500,
    "&::placeholder": { color: "var(--mantine-color-placeholder)" },
  },
  required: { color: "var(--mantine-color-secondary-5)" },
};

export default function TextAreaField({
  description,
  error,
  ...props
}: TextareaProps) {
  return (
    <Textarea
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
