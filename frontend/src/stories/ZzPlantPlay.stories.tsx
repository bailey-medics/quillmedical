import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

const meta: Meta = {
  title: "ZzPlant/Play",
  render: () => <p>planted</p>,
};

export default meta;

export const Planted: StoryObj = {
  play: async () => {
    await expect(1).toBe(2);
  },
};
