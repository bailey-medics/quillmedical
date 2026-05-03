import type { Meta, StoryObj } from "@storybook/react-vite";
import SelectField from "./SelectField";

const meta: Meta<typeof SelectField> = {
  title: "Form/SelectField",
  component: SelectField,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof SelectField>;

export const Default: Story = {
  args: {
    label: "Patient",
    placeholder: "Select a patient",
    data: [
      { value: "1", label: "James Green" },
      { value: "2", label: "Sarah Mitchell" },
      { value: "3", label: "Robert Chen" },
    ],
  },
};

export const Searchable: Story = {
  args: {
    label: "Patient",
    placeholder: "Search patients…",
    data: [
      { value: "1", label: "James Green" },
      { value: "2", label: "Sarah Mitchell" },
      { value: "3", label: "Robert Chen" },
    ],
    searchable: true,
  },
};

export const Required: Story = {
  args: {
    label: "Priority",
    placeholder: "Select priority",
    data: ["Low", "Medium", "High", "Urgent"],
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "Status",
    value: "Active",
    data: ["Active", "Inactive"],
    disabled: true,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
