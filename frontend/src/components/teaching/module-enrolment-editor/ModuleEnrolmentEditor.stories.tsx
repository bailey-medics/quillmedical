/**
 * Module enrolment editor stories.
 *
 * One person's teaching enrolments, organisation by organisation. The
 * editor is controlled, so each story keeps its own ticks in state: the
 * boxes move in the canvas, and nothing is saved.
 */

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ModuleEnrolmentEditor, {
  type EnrolmentByOrganisation,
  type ModuleEnrolmentEditorProps,
} from "./ModuleEnrolmentEditor";

const organisations = [
  {
    id: 3,
    name: "East of England Endoscopy Training Academy",
    modules: [
      {
        id: "colonoscopy-optical-diagnosis",
        title: "Colonoscopy optical diagnosis",
      },
      { id: "chest-xray-interpretation", title: "Chest X-ray interpretation" },
    ],
  },
];

/** Holds the ticks, as the form the editor sits in would. */
function Editor(props: ModuleEnrolmentEditorProps) {
  const [value, setValue] = useState<EnrolmentByOrganisation>(props.value);
  return <ModuleEnrolmentEditor {...props} value={value} onChange={setValue} />;
}

const meta: Meta<typeof ModuleEnrolmentEditor> = {
  title: "Teaching/ModuleEnrolmentEditor",
  component: ModuleEnrolmentEditor,
  render: (args) => <Editor {...args} />,
  args: {
    organisations,
    value: { 3: { "colonoscopy-optical-diagnosis": null } },
    onChange: undefined,
    note: undefined,
  },
};

export default meta;
type Story = StoryObj<typeof ModuleEnrolmentEditor>;

/** One module ticked with no end, one not ticked. */
export const Default: Story = {};

/** Nothing ticked: no end date is offered until a module is. */
export const NothingTicked: Story = {
  args: { value: {} },
};

/** An enrolment with an end date. */
export const WithAnEndDate: Story = {
  args: { value: { 3: { "colonoscopy-optical-diagnosis": "2027-10-05" } } },
};

/** A line under a module, as the member page shows what is missing. */
export const WithNotes: Story = {
  args: {
    note: (_organisationId, moduleId) =>
      moduleId === "colonoscopy-optical-diagnosis"
        ? "Cannot enter yet: no place at this centre."
        : undefined,
  },
};

/** Two organisations, a card for each. */
export const TwoOrganisations: Story = {
  args: {
    organisations: [
      ...organisations,
      {
        id: 7,
        name: "Respiratory Teaching Centre",
        modules: [{ id: "spirometry-basics", title: "Spirometry basics" }],
      },
    ],
  },
};

/** Held still while a save is being sent. */
export const Disabled: Story = {
  args: { disabled: true },
};

/** In dark mode. */
export const Dark: Story = {
  globals: { colorScheme: "dark" },
};
