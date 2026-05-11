import { MultiSelect, type MultiSelectProps } from "@mantine/core";
import { ErrorMessage } from "@components/typography";
import FieldDescription from "@components/typography/FieldDescription";
import classes from "./MultiSelectField.module.css";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-text)",
    marginBottom: "0.25rem",
  },
  required: { color: "var(--mantine-color-secondary-5)" },
};

export default function MultiSelectField({
  description,
  error,
  disabled,
  ...props
}: MultiSelectProps) {
  return (
    <MultiSelect
      {...props}
      disabled={disabled}
      description={
        description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : undefined
      }
      error={error ? <ErrorMessage>{error}</ErrorMessage> : undefined}
      size="lg"
      styles={fieldStyles}
      classNames={{
        root: classes.root,
        input: classes.input,
        pillsList: classes.pillsList,
        inputField: classes.inputField,
        section: classes.section,
        pill: disabled ? classes.disabledPill : classes.pill,
        option: classes.option,
      }}
    />
  );
}
