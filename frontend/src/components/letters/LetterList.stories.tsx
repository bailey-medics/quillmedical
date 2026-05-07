/**
 * Letters Component Stories
 *
 * Demonstrates the clinical letters list component:
 * - Cards with title, status badge, date, author, and summary
 * - Different letter statuses (final, draft, amended)
 * - Loading skeleton state
 * - Empty list
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import LetterList from "./LetterList";
import { fakeLetters } from "@/data/fakeLetters";
import type { LetterSummary } from "./LetterList";

const meta: Meta<typeof LetterList> = {
  title: "Letters/LetterList",
  component: LetterList,
};

export default meta;

type Story = StoryObj<typeof LetterList>;

const mixedStatusLetters: LetterSummary[] = [
  ...fakeLetters,
  {
    id: "letter-draft",
    title: "Follow-up endoscopy report",
    date: "2026-03-12",
    author: "Dr Gareth Corbett",
    authorRole: "Consultant Gastroenterologist",
    status: "draft",
    summary:
      "Upper GI endoscopy performed under conscious sedation. Normal oesophageal mucosa. Mild antral erythema noted. Biopsies taken for CLO test and histology. Awaiting results.",
  },
  {
    id: "letter-amended",
    title: "Amended referral letter — cardiology",
    date: "2026-02-20",
    author: "Dr Emily Williams",
    authorRole: "General Practitioner",
    status: "amended",
    summary:
      "Amendment: Updated medication list to include recently prescribed aspirin 75mg. Original referral reason unchanged — intermittent palpitations with normal resting ECG.",
  },
];

export const Default: Story = {
  args: {
    letters: fakeLetters,
    onLetterClick: (letter) => {
      console.log("Clicked letter:", letter.id);
    },
  },
};

export const AllStatuses: Story = {
  args: {
    letters: mixedStatusLetters,
    onLetterClick: (letter) => {
      console.log("Clicked letter:", letter.id);
    },
  },
};

export const Loading: Story = {
  args: {
    letters: [],
    isLoading: true,
    onLetterClick: (letter) => {
      console.log("Clicked letter:", letter.id);
    },
  },
};

export const Empty: Story = {
  args: {
    letters: [],
    onLetterClick: (letter) => {
      console.log("Clicked letter:", letter.id);
    },
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
