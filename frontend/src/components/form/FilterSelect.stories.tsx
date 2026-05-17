/**
 * FilterSelect Component Stories
 *
 * Demonstrates the filter icon button with a popover multi-select
 * dropdown.
 */

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import BaseCard from "@components/base-card/BaseCard";
import { BodyText } from "@components/typography";
import { VariantRow, VariantStack } from "@/stories/variants";
import FilterSelect from "./FilterSelect";

const meta: Meta<typeof FilterSelect> = {
  title: "Form/Filter select",
  component: FilterSelect,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof FilterSelect>;

const trustData = [
  {
    group: "Trust",
    items: [
      { value: "trust:leeds", label: "Leeds Teaching Hospitals" },
      { value: "trust:bradford", label: "Bradford Teaching Hospitals" },
      { value: "trust:airedale", label: "Airedale NHS Foundation Trust" },
    ],
  },
  {
    group: "Clinical lead",
    items: [
      { value: "lead:morton", label: "Prof James Morton" },
      { value: "lead:singh", label: "Dr Rachel Singh" },
    ],
  },
  {
    group: "Other",
    items: [{ value: "first-pass-only", label: "1st time passers only" }],
  },
];

function InteractiveFilterSelect({
  preselected = [],
}: {
  preselected?: string[];
}) {
  const [value, setValue] = useState<string[]>(preselected);

  return (
    <Group justify="flex-end">
      <FilterSelect
        data={trustData}
        value={value}
        onChange={setValue}
        label="Filter delegates"
        placeholder={"Search filters\u2026"}
        aria-label="Filter delegates"
      />
    </Group>
  );
}

export const Default: Story = {
  render: () => <InteractiveFilterSelect />,
};

export const WithActiveFilters: Story = {
  render: () => (
    <InteractiveFilterSelect preselected={["trust:leeds", "lead:morton"]} />
  ),
};

export const AllVariants: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="No filters active">
        <InteractiveFilterSelect />
      </VariantRow>
      <VariantRow label="2 filters active">
        <InteractiveFilterSelect preselected={["trust:leeds", "lead:morton"]} />
      </VariantRow>
      <VariantRow label="5 filters active">
        <InteractiveFilterSelect
          preselected={[
            "trust:leeds",
            "trust:bradford",
            "lead:morton",
            "lead:singh",
            "first-pass-only",
          ]}
        />
      </VariantRow>
    </VariantStack>
  ),
};

export const InContext: Story = {
  render: () => {
    function Demo() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <BaseCard>
          <Group justify="space-between" align="center">
            <BodyText>All delegates</BodyText>
            <FilterSelect
              data={trustData}
              value={value}
              onChange={setValue}
              label="Filter delegates"
              aria-label="Filter delegates"
            />
          </Group>
        </BaseCard>
      );
    }
    return <Demo />;
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
