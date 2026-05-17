import type { Meta, StoryObj } from "@storybook/react-vite";
import ModuleNav from "./ModuleNav";

const meta: Meta<typeof ModuleNav> = {
  title: "Teaching/Nav/Module nav",
  component: ModuleNav,
  decorators: [
    (Story) => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ModuleNav>;

export const Default: Story = {
  args: {
    moduleTitle: "Colorectal polyps",
    onLearning: () => {},
    onAssessment: () => {},
    onBack: () => {},
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
