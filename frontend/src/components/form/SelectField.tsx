import { Select, type SelectProps } from "@mantine/core";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-black)",
  },
  input: { fontSize: "var(--mantine-font-size-lg)" },
};

export default function SelectField(props: SelectProps) {
  return <Select {...props} size="lg" styles={fieldStyles} />;
}
