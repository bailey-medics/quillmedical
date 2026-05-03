import { MultiSelect, type MultiSelectProps } from "@mantine/core";
import classes from "./MultiSelectField.module.css";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-black)",
    marginBottom: "0.25rem",
  },
  required: { color: "var(--mantine-color-secondary-5)" },
};

export default function MultiSelectField(props: MultiSelectProps) {
  return (
    <MultiSelect
      {...props}
      size="lg"
      styles={fieldStyles}
      classNames={{
        root: classes.root,
        input: classes.input,
        pillsList: classes.pillsList,
        inputField: classes.inputField,
        section: classes.section,
      }}
    />
  );
}
