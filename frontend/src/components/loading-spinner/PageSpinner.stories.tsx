import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryNote } from "@/stories/variants";
import PageSpinner from "./PageSpinner";

const HANDS_OVER_EVERY_MS = 700;

/**
 * A new spinner every so often, as a wait that passes from one part of
 * the app to the next does. The `key` makes each one a fresh element.
 */
function HandOverLoop() {
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setTurn((current) => current + 1),
      HANDS_OVER_EVERY_MS,
    );

    return () => clearInterval(timer);
  }, []);

  return <PageSpinner key={turn} />;
}

const meta: Meta<typeof PageSpinner> = {
  title: "Feedback/Page spinner",
  component: PageSpinner,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof PageSpinner>;

/** The quill in the middle of the page, at the one size a page wait uses. */
export const Default: Story = {};

/**
 * The spinner is taken away and a new one put in its place several times
 * a turn. Each new one starts at the angle the last had reached, so the
 * quill should turn smoothly with no snap back to face on.
 */
export const HandingOver: Story = {
  // The note goes above here, not below: it is the page's height that the
  // spinner centres in, and a note beneath would sit off the screen.
  render: () => (
    <>
      <StoryNote mt={0}>
        A new spinner replaces the old one every 0.7 seconds, as happens when
        one part of Quill hands a wait over to the next. The quill should keep
        turning without restarting.
      </StoryNote>
      <HandOverLoop />
    </>
  ),
};

export const DarkMode: Story = {
  globals: { colorScheme: "dark" },
};
