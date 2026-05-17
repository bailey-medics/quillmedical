import type { Meta, StoryObj } from "@storybook/react-vite";
import LearningNav from "./LearningNav";
import { stubSlides } from "@/components/teaching/slide-layouts/stubSlides";

const meta: Meta<typeof LearningNav> = {
  title: "Teaching/Nav/Learning nav",
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
    onNavigate: () => {},
    onExit: () => {},
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
