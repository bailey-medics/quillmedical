import type { Meta, StoryObj } from "@storybook/react-vite";
import Divider from "./Divider";
import { Stack } from "@mantine/core";
import BodyText from "@/components/typography/BodyText";
import { VariantRow, VariantStack } from "@/stories/variants";

const meta = {
  title: "Divider/Divider",
  component: Divider,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Stack>
      <BodyText>Content above</BodyText>
      <Divider />
      <BodyText>Content below</BodyText>
    </Stack>
  ),
};

export const WithLabel: Story = {
  args: {
    label: "Section",
    labelPosition: "center",
  },
  render: (args) => (
    <Stack>
      <BodyText>Content above</BodyText>
      <Divider {...args} />
      <BodyText>Content below</BodyText>
    </Stack>
  ),
};

export const AllLabelPositions: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="left" horizontal={false}>
        <Divider label="Left label" labelPosition="left" />
      </VariantRow>
      <VariantRow label="center" horizontal={false}>
        <Divider label="Centre label" labelPosition="center" />
      </VariantRow>
      <VariantRow label="right" horizontal={false}>
        <Divider label="Right label" labelPosition="right" />
      </VariantRow>
    </VariantStack>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        height: "4rem",
        alignItems: "center",
      }}
    >
      <BodyText>Left</BodyText>
      <Divider orientation="vertical" />
      <BodyText>Right</BodyText>
    </div>
  ),
};

export const WithSpacing: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="no spacing">
        <Stack gap={0}>
          <BodyText>Above</BodyText>
          <Divider />
          <BodyText>Below</BodyText>
        </Stack>
      </VariantRow>
      <VariantRow label="my=xs">
        <Stack gap={0}>
          <BodyText>Above</BodyText>
          <Divider my="xs" />
          <BodyText>Below</BodyText>
        </Stack>
      </VariantRow>
      <VariantRow label="my=sm">
        <Stack gap={0}>
          <BodyText>Above</BodyText>
          <Divider my="sm" />
          <BodyText>Below</BodyText>
        </Stack>
      </VariantRow>
      <VariantRow label="my=lg">
        <Stack gap={0}>
          <BodyText>Above</BodyText>
          <Divider my="lg" />
          <BodyText>Below</BodyText>
        </Stack>
      </VariantRow>
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  globals: { colorScheme: "dark" },
  render: () => (
    <Stack>
      <BodyText>Content above</BodyText>
      <Divider />
      <BodyText>Content below</BodyText>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          height: "4rem",
          alignItems: "center",
        }}
      >
        <BodyText>Left</BodyText>
        <Divider orientation="vertical" />
        <BodyText>Right</BodyText>
      </div>
    </Stack>
  ),
};
