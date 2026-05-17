/**
 * NotesList Component Stories
 *
 * Demonstrates the clinical notes list component:
 * - Note cards with title, category badge, date, author, and content
 * - Different categories (consultation, telephone, observation, procedure)
 * - Pre-wrapped multi-paragraph content
 * - Loading skeleton state
 * - Empty list
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import NotesList from "./NotesList";
import { fakeNotes } from "@/data/fakeNotes";

const meta: Meta<typeof NotesList> = {
  title: "Notes/Notes list",
  component: NotesList,
};

export default meta;

type Story = StoryObj<typeof NotesList>;

export const Default: Story = {
  args: {
    notes: fakeNotes,
  },
};

export const Loading: Story = {
  args: {
    notes: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    notes: [],
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
