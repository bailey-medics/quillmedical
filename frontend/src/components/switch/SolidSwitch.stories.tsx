import type { Meta, StoryObj } from "@storybook/react-vite";
import { VariantRow, VariantStack } from "@/stories/variants";
import SolidSwitch from "./SolidSwitch";

const meta: Meta<typeof SolidSwitch> = {
  title: "Switch/SolidSwitch",
  component: SolidSwitch,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    checked: { control: "boolean", description: "Whether the switch is on" },
    label: { control: "text", description: "Switch label" },
    description: {
      control: "text",
      description: "Description text below the label",
    },
    disabled: {
      control: "boolean",
      description: "Whether the switch is disabled",
    },
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg", "xl"],
      description: "Switch size",
    },
  },
};
export default meta;
type Story = StoryObj<typeof SolidSwitch>;

export const Default: Story = {
  args: {
    label: "Enable feature",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Patient as participant",
    description: "Allow the patient to reply to this conversation",
  },
};

export const Checked: Story = {
  args: {
    label: "Enabled",
    checked: true,
  },
};

export const Disabled: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="Disabled off">
        <SolidSwitch label="Disabled" disabled />
      </VariantRow>
      <VariantRow label="Disabled on">
        <SolidSwitch label="Disabled" disabled checked />
      </VariantRow>
    </VariantStack>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <VariantStack>
      {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow key={size} label={size === "md" ? "md (default)" : size}>
          <SolidSwitch label="Off" size={size} />
          <SolidSwitch label="On" size={size} checked />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};
