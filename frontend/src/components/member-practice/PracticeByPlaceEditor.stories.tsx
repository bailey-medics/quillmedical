/**
 * Practice-by-place editor stories.
 *
 * One person across the org_units they belong to. The editor is
 * controlled, so each story keeps its own choices in state: the switches
 * move in the canvas, and nothing is saved.
 */

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryNote } from "@/stories/variants";
import PracticeByPlaceEditor, {
  type PracticeByPlace,
  type PracticeByPlaceEditorProps,
} from "./PracticeByPlaceEditor";

const places = [
  { id: 3, name: "Gloucestershire Hospitals", type: "organisation" },
  { id: 4, name: "Oncology", type: "hospital" },
];

const competencies = [
  "perform_venepuncture",
  "certify_death",
  "prescribe_controlled_schedule_2",
];

/** Holds the choices, as the form the editor sits in would. */
function Editor(props: PracticeByPlaceEditorProps) {
  const [value, setValue] = useState<PracticeByPlace>(props.value);
  return <PracticeByPlaceEditor {...props} value={value} onChange={setValue} />;
}

const meta: Meta<typeof PracticeByPlaceEditor> = {
  title: "Cards/Member practice/Practice by place editor",
  component: PracticeByPlaceEditor,
  parameters: { layout: "padded" },
  args: {
    places,
    competencies,
    value: { 3: ["perform_venepuncture"], 4: [] },
    onChange: () => {},
  },
  render: (args) => <Editor {...args} />,
};
export default meta;

type Story = StoryObj<typeof PracticeByPlaceEditor>;

/** Somebody at a trust and at one of its sites. */
export const Default: Story = {};

/** A teaching admin's view of a clinician who also sits teaching. */
export const SomeSwitchesNotTheirs: Story = {
  args: {
    competencies: [...competencies, "view_teaching_cases"],
    mayChange: (competency) => competency === "view_teaching_cases",
  },
  render: (args) => (
    <>
      <Editor {...args} />
      <StoryNote>
        Every competency the person holds is listed. The viewer may switch only
        the teaching one; the rest are disabled, not hidden.
      </StoryNote>
    </>
  ),
};

/** One of their org_units is of a type nobody practises at. */
export const PlaceThatHoldsNoPractice: Story = {
  args: {
    places: [...places, { id: 9, name: "Room 4", type: "room" }],
  },
};

/** No organisation or site has been chosen for them yet. */
export const NoPlaces: Story = {
  args: { places: [], value: {} },
};

/** They will hold no competencies at all. */
export const NoCompetencies: Story = {
  args: { competencies: [] },
};

/** Every switch held still, while the form is being sent. */
export const Disabled: Story = {
  args: { disabled: true },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
