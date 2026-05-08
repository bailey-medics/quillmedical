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

const meta: Meta<typeof LetterList> = {
  title: "Letters/LetterList",
  component: LetterList,
};

export default meta;

type Story = StoryObj<typeof LetterList>;


export const Default: Story = {
  args: {
    letters: fakeLetters,
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

export const DarkModeLoading: Story = {
  ...Loading,
  globals: { colorScheme: "dark" },
};
