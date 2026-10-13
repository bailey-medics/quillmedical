/**
 * RecordsKeptCard Storybook Stories
 *
 * How long an organisation's training records outlast a closed account.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { VariantRow, VariantStack } from "@/stories/variants";
import RecordsKeptCard from "./RecordsKeptCard";

const meta: Meta<typeof RecordsKeptCard> = {
  title: "Admin/Records kept card",
  component: RecordsKeptCard,
  parameters: {
    layout: "padded",
  },
  args: {
    onEdit: undefined,
  },
};

export default meta;
type Story = StoryObj<typeof RecordsKeptCard>;

/** A sponsor that has given three and a half years */
export const Default: Story = {
  args: { months: 42 },
};

/** No period yet, which is how every organisation starts */
export const NotSet: Story = {
  args: { months: null },
};

/** Every state side by side */
export const AllStates: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="not set (default)" horizontal={false}>
        <RecordsKeptCard months={null} onEdit={() => undefined} />
      </VariantRow>
      <VariantRow label="one month" horizontal={false}>
        <RecordsKeptCard months={1} onEdit={() => undefined} />
      </VariantRow>
      <VariantRow label="42 months" horizontal={false}>
        <RecordsKeptCard months={42} onEdit={() => undefined} />
      </VariantRow>
    </VariantStack>
  ),
};
