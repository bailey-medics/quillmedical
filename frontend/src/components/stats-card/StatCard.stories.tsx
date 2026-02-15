import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatCard } from "./StatCard";

const meta = {
  title: "StatCards/StatCard",
  component: StatCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof StatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default stat card showing total users
 */
export const Default: Story = {
  args: {
    title: "Total Users",
    value: 42,
  },
};

/**
 * Stat card with a large number
 */
export const LargeNumber: Story = {
  args: {
    title: "Total Patients",
    value: 1284,
  },
};

/**
 * Stat card in loading state
 */
export const Loading: Story = {
  args: {
    title: "Total Records",
    value: 0,
    loading: true,
  },
};

/**
 * Multiple stat cards in a group layout
 */
export const MultipleCards: Story = {
  args: {
    title: "Total Records",
    value: 42,
  },
  render: () => (
    <div style={{ display: "flex", gap: "1rem", minWidth: "400px" }}>
      <StatCard title="Total Users" value={42} />
      <StatCard title="Total Patients" value={128} />
    </div>
  ),
};

/**
 * Mixed loading states
 */
export const MixedLoading: Story = {
  args: {
    title: "Total Records",
    value: 42,
  },
  render: () => (
    <div style={{ display: "flex", gap: "1rem", minWidth: "400px" }}>
      <StatCard title="Total Users" value={42} loading />
      <StatCard title="Total Patients" value={128} />
    </div>
  ),
};
