import type { StorybookConfig } from "@storybook/types";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: [],

  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
