import type { Meta, StoryObj } from "@storybook/react-vite";
import MultiSelectField from "./MultiSelectField";

const meta: Meta<typeof MultiSelectField> = {
  title: "Form/MultiSelectField",
  component: MultiSelectField,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof MultiSelectField>;

export const Default: Story = {
  args: {
    label: "Participants",
    placeholder: "Add staff to this conversation",
    data: [
      { value: "1", label: "Dr Corbett" },
      { value: "2", label: "Nurse Adams" },
      { value: "3", label: "Dr Patel" },
    ],
  },
};

export const Searchable: Story = {
  args: {
    label: "Participants",
    placeholder: "Search staff…",
    data: [
      { value: "1", label: "Dr Corbett" },
      { value: "2", label: "Nurse Adams" },
      { value: "3", label: "Dr Patel" },
    ],
    searchable: true,
  },
};

export const WithSelections: Story = {
  args: {
    label: "Participants",
    placeholder: "Add staff to this conversation",
    data: [
      { value: "1", label: "Dr Corbett" },
      { value: "2", label: "Nurse Adams" },
      { value: "3", label: "Dr Patel" },
    ],
    value: ["1", "3"],
  },
};

export const Disabled: Story = {
  args: {
    label: "Participants",
    data: [
      { value: "1", label: "Dr Corbett" },
      { value: "2", label: "Nurse Adams" },
    ],
    value: ["1"],
    disabled: true,
  },
};
