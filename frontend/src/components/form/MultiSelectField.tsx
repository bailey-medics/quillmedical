import { MultiSelect, type MultiSelectProps } from "@mantine/core";
import classes from "./MultiSelectField.module.css";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-black)",
    marginBottom: "0.25rem",
  },
};

export default function MultiSelectField(props: MultiSelectProps) {
  return (
    <MultiSelect
      {...props}
      size="lg"
      styles={fieldStyles}
      classNames={{
        input: classes.input,
        pillsList: classes.pillsList,
        inputField: classes.inputField,
        section: classes.section,
      }}
    />
  );
}
