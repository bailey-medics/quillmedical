import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssessmentIntro } from "./AssessmentIntro";

const meta: Meta<typeof AssessmentIntro> = {
  title: "Teaching/AssessmentIntro",
  component: AssessmentIntro,
};

export default meta;
type Story = StoryObj<typeof AssessmentIntro>;

export const Default: Story = {
  args: {
    title: "Before you begin",
    body: `You will be shown 120 polyp images, each displayed as a pair:
white light (WLI) and narrow band imaging (NBI).

For each image pair, select the single best answer from the four options.

**Time limit**: 75 minutes. The timer starts when you click "Begin".

**Marking criteria**:
- ≥70% of your answers must be **high confidence**
- ≥85% of your high-confidence answers must be **correct**

You must meet **both** criteria to pass.`,
    onBegin: () => {},
  },
};

export const Disabled: Story = {
  args: {
    title: "Before you begin",
    body: "Loading assessment...",
    onBegin: () => {},
    disabled: true,
  },
};

export const Loading: Story = {
  args: {
    title: "Before you begin",
    body: `You will be shown 120 polyp images, each displayed as a pair:
white light (WLI) and narrow band imaging (NBI).

For each image pair, select the single best answer from the four options.`,
    onBegin: () => {},
    loading: true,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
