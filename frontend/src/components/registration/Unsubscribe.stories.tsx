import type { Meta, StoryObj } from "@storybook/react-vite";
import Unsubscribe from "./Unsubscribe";

const meta: Meta<typeof Unsubscribe> = {
  title: "Registration/Unsubscribe",
  component: Unsubscribe,
  parameters: { layout: "padded" },
  args: {
    status: "ready",
    email: "a***@e***.com",
    wantsNews: true,
    saving: false,
    saved: false,
    // Storybook would otherwise put a spy here; the page always passes one.
    onChange: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** As somebody arrives from a newsletter: news is on. */
export const Subscribed: Story = {};

/** Just after switching it off. */
export const JustUnsubscribed: Story = {
  args: { wantsNews: false, saved: true },
};

/** Just after switching it back on. */
export const JustResubscribed: Story = {
  args: { wantsNews: true, saved: true },
};

/** Somebody who had already said no opens an old email. */
export const AlreadyUnsubscribed: Story = {
  args: { wantsNews: false },
};

/** The change did not reach the server. */
export const SaveFailed: Story = {
  args: {
    wantsNews: true,
    error: "We could not save that. Please try again.",
  },
};

/** The link is not a real one. */
export const InvalidLink: Story = {
  args: { status: "invalid" },
};

/** The link could not be checked at all. */
export const Unavailable: Story = {
  args: { status: "unavailable" },
};

export const Loading: Story = {
  args: { status: "loading" },
};

export const DarkMode: Story = {
  ...Subscribed,
  globals: { colorScheme: "dark" },
};
