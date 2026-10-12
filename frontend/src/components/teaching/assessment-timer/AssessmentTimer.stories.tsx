import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssessmentTimer } from "./AssessmentTimer";

const meta: Meta<typeof AssessmentTimer> = {
  title: "Teaching/Assessment timer",
  component: AssessmentTimer,
  parameters: {
    docs: {
      description: {
        component:
          "Countdown timer for timed assessments. Shows remaining time and triggers an expiry callback when time runs out. Turns red in the final 5 minutes.",
      },
    },
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof AssessmentTimer>;

/** A new attempt, with its whole time ahead of it. */
export const PlentyOfTime: Story = {
  render: () => <AssessmentTimer secondsLeft={75 * 60} onExpire={() => {}} />,
};

/**
 * An attempt opened part way through: the countdown starts from the
 * seconds the server says are left, not from the attempt's whole time.
 */
export const StartedPartWayThrough: Story = {
  render: () => (
    <AssessmentTimer secondsLeft={42 * 60 + 17} onExpire={() => {}} />
  ),
};

export const FiveMinutesLeft: Story = {
  render: () => <AssessmentTimer secondsLeft={5 * 60} onExpire={() => {}} />,
};

export const OneMinuteLeft: Story = {
  render: () => <AssessmentTimer secondsLeft={60} onExpire={() => {}} />,
};

export const Expired: Story = {
  render: () => <AssessmentTimer secondsLeft={0} onExpire={() => {}} />,
};

export const DarkMode: Story = {
  ...PlentyOfTime,
  globals: { colorScheme: "dark" },
};
