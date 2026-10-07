import type { Meta, StoryObj } from "@storybook/react-vite";
import type { MailingListSummary } from "@lib/newsletter/api";
import MailingListImport from "./MailingListImport";

const summary: MailingListSummary = {
  rows: 876,
  new: 870,
  already_there: 4,
  switched_off: 0,
  opted_in: 874,
  opted_out: 0,
  have_accounts: 3,
  no_address: 0,
  unreadable_answer: 0,
  repeated: 2,
  has_opt_column: true,
  no_address_rows: [],
  unreadable_answer_rows: [],
  fingerprint: "0".repeat(64),
  imported: false,
};

const meta: Meta<typeof MailingListImport> = {
  title: "Newsletter/Mailing list import",
  component: MailingListImport,
  parameters: { layout: "padded" },
  args: {
    stage: "idle",
    // Storybook would otherwise put spies here; the page always passes them.
    onFile: () => {},
    onReject: () => {},
    onImport: () => {},
    onStartAgain: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Before a file is dropped. */
export const Waiting: Story = {};

/** A file has been checked, and nothing has been added yet. */
export const Checked: Story = {
  args: { stage: "checked", summary, fileName: "subscribers.csv" },
};

/** The file does not say who is opted in, so everybody is taken as in. */
export const NoOptInColumn: Story = {
  args: {
    stage: "checked",
    summary: { ...summary, has_opt_column: false },
    fileName: "subscribers.csv",
  },
};

/** Some rows could not be read, and are named by number. */
export const RowsLeftOut: Story = {
  args: {
    stage: "checked",
    fileName: "subscribers.csv",
    summary: {
      ...summary,
      new: 865,
      opted_out: 12,
      switched_off: 5,
      no_address: 3,
      unreadable_answer: 2,
      no_address_rows: [14, 201, 640],
      unreadable_answer_rows: [77, 78],
    },
  },
};

/** The file was not a mailing list. */
export const Refused: Story = {
  args: {
    error: 'No column is headed "Email". The first row must name the columns.',
  },
};

/** After the import. */
export const Imported: Story = {
  args: { stage: "imported", summary: { ...summary, imported: true } },
};

export const Checking: Story = {
  args: { stage: "checking" },
};

export const Importing: Story = {
  args: { stage: "importing", summary, fileName: "subscribers.csv" },
};

export const DarkMode: Story = {
  ...Checked,
  globals: { colorScheme: "dark" },
};
