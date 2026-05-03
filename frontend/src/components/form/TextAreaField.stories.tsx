import type { Meta, StoryObj } from "@storybook/react-vite";
import TextAreaField from "./TextAreaField";

const meta: Meta<typeof TextAreaField> = {
  title: "Form/TextAreaField",
  component: TextAreaField,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof TextAreaField>;

export const Default: Story = {
  args: {
    label: "Message",
    placeholder: "Type your message…",
    minRows: 3,
  },
};

export const WithValue: Story = {
  args: {
    label: "Message",
    value:
      "Dear Dr Corbett, thank you for seeing this patient. They have been experiencing intermittent symptoms over the past three weeks.",
    minRows: 3,
  },
};

export const Autosize: Story = {
  args: {
    label: "Notes",
    placeholder: "Add clinical notes…",
    autosize: true,
    minRows: 3,
    value:
      "Patient attended for routine follow-up appointment. Reports intermittent headaches over the past three weeks, predominantly in the frontal region, occurring two to three times per week. Pain is described as a dull ache, rated 4/10 in severity, lasting approximately two to three hours each episode. No associated nausea, vomiting, visual disturbance, or photophobia.\n\nOn examination, blood pressure was 128/82 mmHg, pulse 72 bpm regular. Neurological examination was unremarkable with no focal deficits. Fundoscopy showed normal optic discs bilaterally.\n\nPlan: Advised to maintain a headache diary for the next four weeks. Recommended adequate hydration and regular sleep pattern. Paracetamol 1g as required for symptomatic relief, no more than four times daily. Review in four weeks with headache diary. Consider referral to neurology if symptoms persist or worsen.",
  },
};

export const Required: Story = {
  args: {
    label: "Reason for referral",
    placeholder: "Describe the reason for this referral",
    required: true,
    minRows: 4,
  },
};

export const Disabled: Story = {
  args: {
    label: "Previous notes",
    value: "Patient presented with mild symptoms. Follow-up in two weeks.",
    disabled: true,
    minRows: 3,
  },
};
