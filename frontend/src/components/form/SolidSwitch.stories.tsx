import type { Meta, StoryObj } from "@storybook/react-vite";
import { VariantRow, VariantStack } from "@/stories/variants";
import SolidSwitch from "./SolidSwitch";

const meta: Meta<typeof SolidSwitch> = {
  title: "Form/SolidSwitch",
  component: SolidSwitch,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    checked: { control: "boolean", description: "Whether the switch is on" },
    label: { control: "text", description: "Label above the switch" },
    description: {
      control: "text",
      description: "Helper text below the switch",
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
        <VariantRow key={size} label={size === "lg" ? "lg (default)" : size}>
          <SolidSwitch label="Toggle" size={size} />
          <SolidSwitch label="Toggle" size={size} checked />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...WithDescription,
  globals: { colorScheme: "dark" },
};
