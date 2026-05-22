import type { Meta, StoryObj } from "@storybook/react-vite";
import TeachingLearningNav from "./TeachingLearningNav";
import { stubSlides } from "@/components/teaching/slide-layouts/stubSlides";

const meta: Meta<typeof TeachingLearningNav> = {
  title: "Teaching/Nav/Learning nav",
  component: TeachingLearningNav,
  decorators: [
    (Story) => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TeachingLearningNav>;

export const Default: Story = {
  args: {
    slides: stubSlides,
    currentIndex: 2,
    onNavigate: () => {},
    onExit: () => {},
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
