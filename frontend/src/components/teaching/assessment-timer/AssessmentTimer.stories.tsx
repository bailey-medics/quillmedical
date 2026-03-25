import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssessmentTimer } from "./AssessmentTimer";

const meta: Meta<typeof AssessmentTimer> = {
  title: "Teaching/AssessmentTimer",
  component: AssessmentTimer,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof AssessmentTimer>;

export const PlentyOfTime: Story = {
  args: {
    timeLimitMinutes: 75,
    startedAt: new Date().toISOString(),
    onExpire: () => {},
  },
};

export const FiveMinutesLeft: Story = {
  args: {
    timeLimitMinutes: 75,
    startedAt: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
    onExpire: () => {},
  },
};

export const OneMinuteLeft: Story = {
  args: {
    timeLimitMinutes: 75,
    startedAt: new Date(Date.now() - 74 * 60 * 1000).toISOString(),
    onExpire: () => {},
  },
};

export const Expired: Story = {
  args: {
    timeLimitMinutes: 75,
    startedAt: new Date(Date.now() - 80 * 60 * 1000).toISOString(),
    onExpire: () => {},
  },
};
