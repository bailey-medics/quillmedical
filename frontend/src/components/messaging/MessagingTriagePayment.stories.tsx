import type { Meta, StoryObj } from "@storybook/react-vite";
import MessagingTriagePayment from "./MessagingTriagePayment";

const meta: Meta<typeof MessagingTriagePayment> = {
  title: "Messaging/MessagingTriagePayment",
  component: MessagingTriagePayment,
};

export default meta;
type Story = StoryObj<typeof MessagingTriagePayment>;

export const Default: Story = {
  args: {},
};
