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
import type { ClinicalNote } from "./NotesList";

const meta: Meta<typeof NotesList> = {
  title: "Notes/NotesList",
  component: NotesList,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof NotesList>;

const allCategoryNotes: ClinicalNote[] = [
  ...fakeNotes,
  {
    id: "note-procedure",
    title: "Upper GI endoscopy",
    date: "2026-03-25",
    author: "Dr Gareth Corbett",
    authorRole: "Consultant Gastroenterologist",
    category: "procedure",
    content:
      "OGD performed under conscious sedation (midazolam 3mg IV). Normal oesophageal mucosa. Mild antral erythema noted. CLO test taken — result pending. Biopsies x2 from antrum sent for histology. No complications. Patient recovered well and discharged with post-procedure advice.",
  },
];

export const Default: Story = {
  args: {
    notes: fakeNotes,
  },
};

export const AllCategories: Story = {
  args: {
    notes: allCategoryNotes,
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
