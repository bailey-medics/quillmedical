/**
 * PassportRecordTable Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import PassportRecordTable from "./PassportRecordTable";
import { passportRecords } from "./fixtures";

const meta: Meta<typeof PassportRecordTable> = {
  title: "Passport/Passport record table",
  component: PassportRecordTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof PassportRecordTable>;

export const Default: Story = {
  args: { records: passportRecords, onSelect: fn() },
};

/** A career's worth: more than a page, so the pagination shows. */
export const ManyRecords: Story = {
  args: {
    records: Array.from({ length: 3 }, (_, round) =>
      passportRecords.map((record) => ({
        ...record,
        key: `${record.key}:${round}`,
      })),
    ).flat(),
    onSelect: fn(),
  },
};

export const Empty: Story = {
  args: { records: [], onSelect: fn() },
};

export const Loading: Story = {
  args: { records: [], isLoading: true, onSelect: fn() },
};
