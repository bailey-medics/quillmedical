import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import BaseCard from "@components/base-card/BaseCard";
import MultiSelectField from "./MultiSelectField";

const meta: Meta<typeof MultiSelectField> = {
  title: "Form/MultiSelectField",
  component: MultiSelectField,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof MultiSelectField>;

const staffData = [
  { value: "1", label: "Dr Corbett" },
  { value: "2", label: "Nurse Adams" },
  { value: "3", label: "Dr Patel" },
  { value: "4", label: "Dr Okonkwo" },
  { value: "5", label: "Nurse Williams" },
  { value: "6", label: "Dr Chen" },
  { value: "7", label: "Dr Fernandez" },
  { value: "8", label: "Nurse Taylor" },
  { value: "9", label: "Dr Nowak" },
  { value: "10", label: "Nurse Brown" },
  { value: "11", label: "Dr Singh" },
  { value: "12", label: "Nurse O'Brien" },
  { value: "13", label: "Dr Takahashi" },
  { value: "14", label: "Nurse Clarke" },
  { value: "15", label: "Dr Abrams" },
  { value: "16", label: "Nurse Kowalski" },
  { value: "17", label: "Dr Mensah" },
  { value: "18", label: "Nurse Reid" },
  { value: "19", label: "Dr Johansson" },
  { value: "20", label: "Nurse Kapoor" },
];

export const Default: Story = {
  args: {
    label: "Participants",
    placeholder: "Add staff to this conversation",
    data: staffData,
  },
};

export const WithDescription: Story = {
  args: {
    label: "Participants",
    description: "Select staff members to include in this conversation",
    placeholder: "Add staff to this conversation",
    data: staffData,
  },
};

export const Required: Story = {
  args: {
    label: "Participants",
    placeholder: "Add staff to this conversation",
    data: staffData,
    required: true,
  },
};

export const Searchable: Story = {
  args: {
    label: "Participants",
    placeholder: "Search staff…",
    data: staffData,
    searchable: true,
  },
};

const mixedLengthData = [
  { value: "1", label: "Dr Li" },
  { value: "2", label: "Nurse Adams" },
  { value: "3", label: "Dr Alexander Richardson-Pemberton" },
  { value: "4", label: "Dr Wu" },
  { value: "5", label: "Nurse Jacqueline Worthington-Smythe" },
  { value: "6", label: "Dr Fernandez" },
  { value: "7", label: "Nurse K" },
  { value: "8", label: "Dr Christopher Montgomery-Hamilton" },
  { value: "9", label: "Dr Ay" },
  { value: "10", label: "Nurse Patricia Elizabeth Okonkwo-Robertson" },
  { value: "11", label: "Dr Patel" },
  { value: "12", label: "Nurse Brown" },
  { value: "13", label: "Dr Bartholomew Henderson-Warner" },
  { value: "14", label: "Dr Jo" },
  { value: "15", label: "Nurse Williams" },
];

export const ManySelected: Story = {
  args: {
    label: "Participants",
    placeholder: "Add staff to this conversation",
    data: mixedLengthData,
    defaultValue: mixedLengthData.map((s) => s.value),
  },
};

export const Disabled: Story = {
  args: {
    label: "Participants",
    data: [
      { value: "1", label: "Dr Corbett" },
      { value: "2", label: "Nurse Adams" },
      { value: "3", label: "Dr Patel" },
    ],
    value: ["1", "2", "3"],
    disabled: true,
  },
};

export const WithError: Story = {
  args: {
    label: "Participants",
    placeholder: "Add staff to this conversation",
    data: staffData,
    error: "At least one participant is required",
  },
};

export const DarkMode: Story = {
  ...WithDescription,
  globals: { colorScheme: "dark" },
  render: (args) => (
    <Stack gap="xl">
      <BaseCard>
        <MultiSelectField {...args} required />
      </BaseCard>
      <MultiSelectField {...args} required />
      <BaseCard>
        <MultiSelectField
          label="Participants - disabled"
          data={[
            { value: "1", label: "Dr Corbett" },
            { value: "2", label: "Nurse Adams" },
            { value: "3", label: "Dr Patel" },
          ]}
          value={["1", "2", "3"]}
          disabled
        />
      </BaseCard>
      <BaseCard>
        <MultiSelectField
          label="Participants - error"
          placeholder="Add staff to this conversation"
          data={staffData}
          error="At least one participant is required"
        />
      </BaseCard>
    </Stack>
  ),
};
