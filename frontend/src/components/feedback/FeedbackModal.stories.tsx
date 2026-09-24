/**
 * FeedbackModal Component Stories
 *
 * - Default: the empty form, send disabled until a message is typed
 * - Sent: after a successful send, the confirmation replaces the form
 * - WithError: the send failed, and the form says so and keeps the message
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import FeedbackModal from "./FeedbackModal";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const meta: Meta<typeof FeedbackModal> = {
  title: "Feedback/Feedback modal",
  component: FeedbackModal,
  parameters: { layout: "fullscreen" },
  // Both set explicitly: `argTypesRegex` would otherwise inject a spy into
  // any `on*` prop left unset, and a spy `onSubmit` resolves at once.
  args: {
    opened: true,
    onClose: () => {},
    onSubmit: async () => {
      await delay(800);
    },
  },
};

export default meta;

type Story = StoryObj<typeof FeedbackModal>;

/** The empty form */
export const Default: Story = {};

/** Sent — the confirmation replaces the form */
export const Sent: Story = {
  play: async () => {
    // The modal renders in a portal, so query from document.body
    const body = within(document.body);
    await userEvent.type(
      body.getByRole("textbox", { name: /message/i }),
      "The captions on slide 3 are a sentence behind the video.",
    );
    await userEvent.click(body.getByTestId("submit-button"));
    await expect(await body.findByText("Feedback sent")).toBeInTheDocument();
  },
};

/** The send failed — the message stays so it can be tried again */
export const WithError: Story = {
  args: {
    onSubmit: async () => {
      await delay(500);
      throw new Error("HTTP 500");
    },
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.type(
      body.getByRole("textbox", { name: /message/i }),
      "The dose in case 4 looks wrong.",
    );
    await userEvent.click(body.getByTestId("submit-button"));
    await expect(
      await body.findByText("Your feedback was not sent"),
    ).toBeInTheDocument();
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
