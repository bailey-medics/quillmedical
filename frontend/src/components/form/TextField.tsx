import { TextInput, type TextInputProps } from "@mantine/core";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-black)",
    marginBottom: "0.25rem",
  },
  input: { fontSize: "var(--mantine-font-size-lg)" },
};

export default function TextField(props: TextInputProps) {
  return <TextInput {...props} size="lg" styles={fieldStyles} />;
}
