import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = { title: "Smoke/Hello" };
export default meta;

export const Works: StoryObj = {
  render: () => <div style={{ padding: 16 }}>Hello from Storybook ✅</div>,
};
