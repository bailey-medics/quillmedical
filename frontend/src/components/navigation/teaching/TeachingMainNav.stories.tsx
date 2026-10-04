import type { Meta, StoryObj } from "@storybook/react-vite";
import TeachingMainNav from "./TeachingMainNav";

const meta: Meta<typeof TeachingMainNav> = {
  component: TeachingMainNav,
  title: "Teaching/Nav/Dashboard nav",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof TeachingMainNav>;

export const Default: Story = {};

export const WithModuleName: Story = {
  args: {
    moduleName: "Acute stroke assessment",
    /* Never followed in Storybook; it is here so the link renders. */
    moduleHref: "/teaching/acute-stroke-assessment",
  },
};

/**
 * The pages beneath a module: a result, and its results by question
 * inside that. The links open only on their own addresses, so in
 * Storybook, which is on none of them, the chain shows closed.
 */
export const WithResultTrail: Story = {
  args: {
    moduleName: "Acute stroke assessment",
    moduleHref: "/teaching/acute-stroke-assessment",
    trail: [
      { label: "Result", href: "/teaching/assessment/7/result" },
      {
        label: "Results by question",
        href: "/teaching/assessment/7/question-results",
      },
    ],
  },
};

export const DarkMode: Story = {
  globals: { colorScheme: "dark" },
};
