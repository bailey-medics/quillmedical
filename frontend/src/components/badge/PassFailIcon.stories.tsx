/**
 * PassIcon and FailIcon Stories
 *
 * Demonstrates the atomic pass/fail indicator icons used in
 * assessments and score breakdowns.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import PassIcon from "./PassIcon";
import FailIcon from "./FailIcon";
import { BodyTextInline } from "@/components/typography";
import { VariantRow, VariantStack } from "@/stories/variants";

const meta: Meta = {
  title: "Badge/PassFailIcon",
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

/** Default pass and fail icons side by side. */
export const Default: Story = {
  render: () => (
    <Group gap="lg">
      <Group gap="xs">
        <PassIcon />
        <BodyTextInline>Pass</BodyTextInline>
      </Group>
      <Group gap="xs">
        <FailIcon />
        <BodyTextInline>Fail</BodyTextInline>
      </Group>
    </Group>
  ),
};

/** All size variants for PassIcon. */
export const PassSizes: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="xs">
        <PassIcon size="xs" />
      </VariantRow>
      <VariantRow label="sm (default)">
        <PassIcon size="sm" />
      </VariantRow>
      <VariantRow label="md">
        <PassIcon size="md" />
      </VariantRow>
      <VariantRow label="lg">
        <PassIcon size="lg" />
      </VariantRow>
      <VariantRow label="xl">
        <PassIcon size="xl" />
      </VariantRow>
    </VariantStack>
  ),
};

/** All size variants for FailIcon. */
export const FailSizes: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="xs">
        <FailIcon size="xs" />
      </VariantRow>
      <VariantRow label="sm (default)">
        <FailIcon size="sm" />
      </VariantRow>
      <VariantRow label="md">
        <FailIcon size="md" />
      </VariantRow>
      <VariantRow label="lg">
        <FailIcon size="lg" />
      </VariantRow>
      <VariantRow label="xl">
        <FailIcon size="xl" />
      </VariantRow>
    </VariantStack>
  ),
};
