/**
 * FrameworkField Storybook Stories
 */

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import FrameworkField from "./FrameworkField";
import type { FrameworkOption } from "@lib/passport/frameworks";

const options: FrameworkOption[] = [
  {
    id: "clinical",
    name: "General clinical skills",
    publisher: "Quill Medical",
    version: "2026",
    specialties: [],
  },
  {
    id: "uk_sact_board_2023",
    name: "Prescriber competencies for reviewing and prescribing SACT",
    publisher: "UK SACT Board",
    version: "November 2023",
    specialties: ["oncology", "haematology"],
  },
  {
    id: "surgery_sheet",
    name: "Theatre sign-off sheet",
    publisher: "A Trust",
    version: "2025",
    specialties: ["general_surgery"],
  },
];

const meta: Meta<typeof FrameworkField> = {
  title: "Passport/Framework field",
  component: FrameworkField,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof FrameworkField>;

function Controlled(props: { initial: string[]; disabled?: boolean }) {
  const [value, setValue] = useState(props.initial);
  return (
    <FrameworkField
      options={options}
      value={value}
      onChange={setValue}
      disabled={props.disabled}
    />
  );
}

/** Nothing chosen yet. Typing finds a framework by name or publisher. */
export const Default: Story = {
  render: () => <Controlled initial={[]} />,
};

/** Two frameworks chosen. Narrowing the specialty keeps both listed. */
export const Chosen: Story = {
  render: () => <Controlled initial={["clinical", "uk_sact_board_2023"]} />,
};

export const Disabled: Story = {
  render: () => <Controlled initial={["clinical"]} disabled />,
};
