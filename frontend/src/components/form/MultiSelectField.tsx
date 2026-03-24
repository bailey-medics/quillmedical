import { MultiSelect, type MultiSelectProps } from "@mantine/core";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-dimmed)",
    fontWeight: 400,
  },
  input: { fontSize: "var(--mantine-font-size-lg)" },
};

export default function MultiSelectField(props: MultiSelectProps) {
  return <MultiSelect {...props} styles={fieldStyles} />;
}
