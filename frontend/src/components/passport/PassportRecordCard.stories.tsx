/**
 * PassportRecordCard Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import PassportRecordCard from "./PassportRecordCard";

const meta: Meta<typeof PassportRecordCard> = {
  title: "Passport/Record card",
  component: PassportRecordCard,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof PassportRecordCard>;

/** A logbook entry, as its page shows it. */
export const LogbookEntry: Story = {
  args: {
    date: "2026-03-12",
    facts: [
      { label: "Setting", value: "Endoscopy unit" },
      { label: "Supervision", value: "Supervised" },
      { label: "Supervisor", value: "Dr Amara Okonkwo" },
      { label: "Indication", value: "Persistent cough" },
      { label: "Outcome", value: null },
      { label: "Notes", value: null },
    ],
  },
};

/** A reflection: the writing is prose, kept in its paragraphs. */
export const Reflection: Story = {
  args: {
    date: "2026-01-12",
    facts: [
      {
        label: "Reflection",
        value:
          "What happened on the ward that night.\n\nWhat I took from it.\n\nWhat I would do differently next time.",
        prose: true,
      },
    ],
  },
};

/** Only the date: every optional fact left empty. */
export const DateOnly: Story = {
  args: { date: "2026-03-12", facts: [{ label: "Notes", value: null }] },
};
