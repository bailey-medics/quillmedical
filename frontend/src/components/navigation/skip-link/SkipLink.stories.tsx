import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryNote } from "@/stories/variants";
import { SkipLink, SkipLinkTarget } from "./SkipLink";

const meta: Meta<typeof SkipLink> = {
  title: "Navigation/Skip link",
  component: SkipLink,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof SkipLink>;

/** Hidden until focused: press Tab in the canvas to reveal it. */
export const Default: Story = {
  render: () => (
    <>
      <SkipLink />
      <SkipLinkTarget>
        <StoryNote>
          Press Tab to show the skip link, then Enter to move focus here.
        </StoryNote>
      </SkipLinkTarget>
    </>
  ),
};

/** As it looks while focused. */
export const Focused: Story = {
  parameters: { pseudo: { focus: true, focusVisible: true } },
  render: () => <SkipLink />,
};

export const DarkMode: Story = {
  globals: { colorScheme: "dark" },
  parameters: { pseudo: { focus: true, focusVisible: true } },
  render: () => <SkipLink />,
};
