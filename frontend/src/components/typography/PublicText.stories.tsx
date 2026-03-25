import type { Meta, StoryObj } from "@storybook/react-vite";
import PublicText from "./PublicText";
import { Box, Stack } from "@mantine/core";
import { VariantRow, VariantStack } from "@/stories/variants";
import { colours } from "@/styles/colours";

const meta = {
  title: "Public/Typography/PublicText",
  component: PublicText,
  parameters: {
    layout: "padded",
    backgrounds: { default: "dark" },
  },
  decorators: [
    (Story) => (
      <Box maw={800} bg={colours.navy} p="xl">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof PublicText>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleText =
  "Exceptional clinical care deserves exceptional clinical tools. Software your team actually wants to use.";

export const Default: Story = {
  args: {
    children: sampleText,
  },
};

export const AllSizes: Story = {
  args: { children: "" },
  render: () => (
    <VariantStack>
      <VariantRow label="sm">
        <PublicText size="sm">{sampleText}</PublicText>
      </VariantRow>
      <VariantRow label="md (default)">
        <PublicText size="md">{sampleText}</PublicText>
      </VariantRow>
      <VariantRow label="lg">
        <PublicText size="lg">{sampleText}</PublicText>
      </VariantRow>
    </VariantStack>
  ),
};

export const Dimmed: Story = {
  args: {
    children: sampleText,
    dimmed: true,
  },
};

export const DimmedSizes: Story = {
  args: { children: "" },
  render: () => (
    <VariantStack>
      <VariantRow label="sm dimmed">
        <PublicText size="sm" dimmed>
          {sampleText}
        </PublicText>
      </VariantRow>
      <VariantRow label="md dimmed">
        <PublicText size="md" dimmed>
          {sampleText}
        </PublicText>
      </VariantRow>
      <VariantRow label="lg dimmed">
        <PublicText size="lg" dimmed>
          {sampleText}
        </PublicText>
      </VariantRow>
    </VariantStack>
  ),
};

export const LeftAligned: Story = {
  args: {
    children: sampleText,
    ta: "left",
  },
};

export const Combined: Story = {
  args: { children: "" },
  render: () => (
    <Stack gap="md">
      <PublicText size="lg">
        Exceptional clinical care deserves exceptional clinical tools.
      </PublicText>
      <PublicText dimmed>
        Whether you're a patient seeking care or a clinic managing
        communications, Quill ensures secure, auditable interactions.
      </PublicText>
    </Stack>
  ),
};
