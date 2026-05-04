import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import BaseCard from "@components/base-card/BaseCard";
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

export const WithDescription: Story = {
  args: {
    label: "Priority",
    description: "Urgent cases are reviewed within 24 hours",
    placeholder: "Select priority",
    data: ["Low", "Medium", "High", "Urgent"],
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
  ...WithDescription,
  globals: { colorScheme: "dark" },
  render: (args) => (
    <Stack gap="xl">
      <BaseCard>
        <SelectField {...args} />
      </BaseCard>
      <SelectField {...args} />
    </Stack>
  ),
};
