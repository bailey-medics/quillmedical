import { Select, type SelectProps } from "@mantine/core";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-dimmed)",
    fontWeight: 400,
  },
  input: { fontSize: "var(--mantine-font-size-lg)" },
};

export default function SelectField(props: SelectProps) {
  return <Select {...props} styles={fieldStyles} />;
}
