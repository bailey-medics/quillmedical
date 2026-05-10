import type { Meta, StoryObj } from "@storybook/react-vite";
import PublicFooter from "./PublicFooter";

const meta: Meta<typeof PublicFooter> = {
  title: "Public/Footer/PublicFooter",
  component: PublicFooter,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          background: "var(--public-navy)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PublicFooter>;

/** Default footer with link columns, logo, and copyright. */
export const Default: Story = {};
