import { Textarea, type TextareaProps } from "@mantine/core";

const fieldStyles = {
  label: {
    fontSize: "var(--mantine-font-size-lg)",
    color: "var(--mantine-color-black)",
    marginBottom: "0.25rem",
  },
  input: { fontSize: "var(--mantine-font-size-lg)" },
};

export default function TextAreaField(props: TextareaProps) {
  return <Textarea {...props} size="lg" styles={fieldStyles} />;
}
