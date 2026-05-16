import type { Meta, StoryObj } from "@storybook/react-vite";
import Callout from "./Callout";
import { VariantRow, VariantStack } from "@/stories/variants";

const meta: Meta<typeof Callout> = {
  title: "Teaching/Callout",
  component: Callout,
};

export default meta;
type Story = StoryObj<typeof Callout>;

export const Default: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="Info" horizontal={false}>
        <Callout type="info">
          The Paris classification is the international standard for describing
          superficial gastrointestinal neoplasms.
        </Callout>
      </VariantRow>
      <VariantRow label="Warning" horizontal={false}>
        <Callout type="warning">
          The presence of a depressed component (0-IIc) changes management.
        </Callout>
      </VariantRow>
      <VariantRow label="Success" horizontal={false}>
        <Callout type="success">
          You have completed this section. Well done!
        </Callout>
      </VariantRow>
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="Info" horizontal={false}>
        <Callout type="info">
          The Paris classification is the international standard for describing
          superficial gastrointestinal neoplasms.
        </Callout>
      </VariantRow>
      <VariantRow label="Warning" horizontal={false}>
        <Callout type="warning">
          The presence of a depressed component (0-IIc) changes management.
        </Callout>
      </VariantRow>
      <VariantRow label="Success" horizontal={false}>
        <Callout type="success">
          You have completed this section. Well done!
        </Callout>
      </VariantRow>
    </VariantStack>
  ),
  globals: { colorScheme: "dark" },
};
