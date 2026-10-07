/**
 * CompetencyPicker Storybook Stories
 */

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import CompetencyPicker from "./CompetencyPicker";

const meta: Meta<typeof CompetencyPicker> = {
  title: "Passport/Competency picker",
  component: CompetencyPicker,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof CompetencyPicker>;

function Controlled({ frameworks }: { frameworks: string[] }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <CompetencyPicker
      value={value}
      onChange={setValue}
      frameworks={frameworks}
    />
  );
}

/** One framework: its competencies, in its document's order. */
export const OneFramework: Story = {
  render: () => <Controlled frameworks={["clinical"]} />,
};

/** Two frameworks, each under its own heading. Nothing else is listed. */
export const TwoFrameworks: Story = {
  render: () => <Controlled frameworks={["clinical", "oncology"]} />,
};

/**
 * No framework chosen. The field lists nothing and says where to choose
 * one: it does not fall back to every competency Quill knows.
 */
export const NoFrameworks: Story = {
  render: () => <Controlled frameworks={[]} />,
};
