/**
 * PictureActionCard Component Stories
 *
 * Demonstrates the PictureActionCard component with and without cover images.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { SimpleGrid } from "@mantine/core";
import PictureActionCard from "./PictureActionCard";

const meta = {
  title: "Action card/Picture action card",
  component: PictureActionCard,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof PictureActionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default
 *
 * Module card with a cover image, title, description, and button.
 */
export const Default: Story = {
  args: {
    title: "Colorectal Polyps",
    description:
      "Morphology categories of superficial lesions, clinical implications, and standardised reporting using the Paris classification.",
    imageSrc: "/storybook/paris-classification.png",
    imageAlt: "Paris classification of superficial neoplasms",
    buttonLabel: "View module",
    buttonUrl: "/teaching/colorectal-polyps",
  },
};

/**
 * Grid
 *
 * Two module cards side-by-side in a responsive grid, matching the
 * teaching dashboard layout.
 */
export const Grid: Story = {
  args: {
    title: "Colorectal Polyps",
    description: "Morphology categories of superficial lesions.",
    imageSrc: "/storybook/paris-classification.png",
    imageAlt: "Paris classification of superficial neoplasms",
    buttonLabel: "View module",
    buttonUrl: "/teaching/colorectal-polyps",
  },
  render: () => (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <PictureActionCard
        title="Colorectal Polyps"
        description="Morphology categories of superficial lesions, clinical implications, and standardised reporting using the Paris classification."
        imageSrc="/storybook/paris-classification.png"
        imageAlt="Paris classification of superficial neoplasms"
        buttonLabel="View module"
        buttonUrl="/teaching/colorectal-polyps"
      />
      <PictureActionCard
        title="Chest X-ray Interpretation"
        description="Systematic approach to interpreting chest radiographs, common pathologies, and structured reporting."
        imageSrc="/storybook/chest-xray-pneumothorax.png"
        imageAlt="Chest X-ray showing pneumothorax"
        buttonLabel="View module"
        buttonUrl="/teaching/chest-xray-interpretation"
      />
    </SimpleGrid>
  ),
};
