import { Select, type SelectProps } from "@mantine/core";
import classes from "./SelectField.module.css";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-black)",
    marginBottom: "0.25rem",
  },
  input: { fontSize: "var(--mantine-font-size-lg)" },
  required: { color: "var(--mantine-color-secondary-5)" },
};

export default function SelectField(props: SelectProps) {
  return (
    <Select
      {...props}
      size="lg"
      styles={fieldStyles}
      classNames={{ root: classes.root, section: classes.section }}
    />
  );
}
