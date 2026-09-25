import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryNote } from "@/stories/variants";
import LoadingSpinner from "./LoadingSpinner";

const meta: Meta<typeof LoadingSpinner> = {
  title: "Feedback/Loading spinner",
  component: LoadingSpinner,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof LoadingSpinner>;

/** A screen reader hears "Loading"; the spinner itself is hidden from it. */
export const Default: Story = {
  render: (args) => (
    <>
      <LoadingSpinner {...args} />
      <StoryNote>Screen readers hear &quot;Loading&quot;.</StoryNote>
    </>
  ),
};

/** Naming what is loading, for a panel rather than a page. */
export const WithLabel: Story = {
  args: { label: "Loading messages" },
};

export const DarkMode: Story = {
  globals: { colorScheme: "dark" },
};
