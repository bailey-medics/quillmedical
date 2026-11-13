/**
 * FrameworkField Storybook Stories
 */

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import FrameworkField from "./FrameworkField";
import type { FrameworkOption } from "@lib/passport/frameworks";

const options: FrameworkOption[] = [
  {
    id: "quill_2_test",
    name: "Core clinical skills",
    publisher: "Quill Medical",
    specialties: [],
  },
  {
    id: "quill_test",
    name: "Medical and oncology skills",
    publisher: "Quill Medical",
    specialties: ["oncology", "haematology"],
  },
  {
    id: "surgery_sheet",
    name: "Theatre sign-off sheet",
    publisher: "A Trust",
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
  render: () => <Controlled initial={["quill_2_test", "quill_test"]} />,
};

export const Disabled: Story = {
  render: () => <Controlled initial={["quill_2_test"]} disabled />,
};
