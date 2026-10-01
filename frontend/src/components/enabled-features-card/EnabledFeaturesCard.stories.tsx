/**
 * EnabledFeaturesCard Storybook Stories
 *
 * The features switched on at an organisation or a site.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import EnabledFeaturesCard from "./EnabledFeaturesCard";

const meta: Meta<typeof EnabledFeaturesCard> = {
  title: "Admin/Enabled features card",
  component: EnabledFeaturesCard,
  parameters: {
    layout: "padded",
  },
  args: {
    onEdit: undefined,
  },
};

export default meta;
type Story = StoryObj<typeof EnabledFeaturesCard>;

/** A site with the passport on */
export const PassportOnly: Story = {
  args: { features: ["passport"] },
};

/** A site paying for its members' writing, as Cheltenham oncology does */
export const PassportWithCover: Story = {
  args: { features: ["passport", "passport_write"] },
};

/** An organisation with several features */
export const SeveralFeatures: Story = {
  args: { features: ["teaching", "messaging", "letters", "passport"] },
};

/** Nothing switched on yet */
export const NoFeatures: Story = {
  args: { features: [] },
};
