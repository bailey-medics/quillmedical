import type { Meta, StoryObj } from "@storybook/react-vite";
import LearningNav from "./LearningNav";
import { stubSlides } from "@/components/teaching/slide-layouts/stubSlides";

const meta: Meta<typeof LearningNav> = {
  title: "Navigation/LearningNav",
  component: LearningNav,
  decorators: [
    (Story) => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof LearningNav>;

export const Default: Story = {
  args: {
    slides: stubSlides,
    currentIndex: 2,
    visited: new Set([0, 1]),
    onNavigate: () => {},
  },
};

export const AtStart: Story = {
  args: {
    slides: stubSlides,
    currentIndex: 0,
    visited: new Set(),
    onNavigate: () => {},
  },
};

export const AllVisited: Story = {
  args: {
    slides: stubSlides,
    currentIndex: 6,
    visited: new Set([0, 1, 2, 3, 4, 5, 6]),
    onNavigate: () => {},
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
