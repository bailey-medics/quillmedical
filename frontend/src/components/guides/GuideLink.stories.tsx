/**
 * GuideLink Stories
 *
 * The link from a page to the guide that explains it. It is drawn only
 * for a reader the guide is shown to, so each story names its reader
 * through `parameters.mockUser`.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { expect, within } from "storybook/test";
import PageHeader from "@/components/page-header";
import { VariantRow, VariantStack } from "@/stories/variants";
import GuideLink from "./GuideLink";

const meta = {
  title: "Guides/Guide link",
  component: GuideLink,
  parameters: {
    layout: "padded",
    // The guides here belong to teaching, so the reader has it switched on.
    mockUser: { enabled_features: ["teaching"] },
  },
  args: { slug: "add-a-delegate-by-hand" },
} satisfies Meta<typeof GuideLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One link, named by its guide's title. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("link", {
        name: "Guide: Add a delegate by hand",
      }),
    ).toBeInTheDocument();
  },
};

/** Where a page puts it: on its own line, under the page's title. */
export const UnderAPageHeader: Story = {
  render: (args) => (
    <Stack gap="lg">
      <PageHeader title="Create new user" />
      <GuideLink {...args} />
    </Stack>
  ),
};

/**
 * The same page for a reader the guide is not shown to, here somebody
 * without teaching: the title, and no link under it.
 */
export const HiddenFromOtherReaders: Story = {
  ...UnderAPageHeader,
  parameters: { mockUser: { enabled_features: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Create new user" });
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
  },
};

/** A link to each kind of guide. */
export const AllGuides: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="for a delegate" horizontal={false}>
        <GuideLink slug="take-a-module-and-its-assessment" />
      </VariantRow>
      <VariantRow label="for an admin" horizontal={false}>
        <GuideLink slug="see-delegates-results" />
      </VariantRow>
      <VariantRow label="public" horizontal={false}>
        <GuideLink slug="join-a-course" />
      </VariantRow>
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
