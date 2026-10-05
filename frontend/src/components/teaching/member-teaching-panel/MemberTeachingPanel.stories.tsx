/**
 * Member teaching panel stories.
 *
 * One person's teaching at one org_unit. Nothing is saved: the save
 * resolves at once, so the form's states can be seen.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import MemberTeachingPanel from "./MemberTeachingPanel";

const organisation = {
  id: 3,
  name: "East of England Endoscopy Training Academy",
  modules: [
    {
      id: "colonoscopy-optical-diagnosis",
      title: "Colonoscopy optical diagnosis",
    },
    { id: "chest-xray-interpretation", title: "Chest X-ray interpretation" },
  ],
};

const meta: Meta<typeof MemberTeachingPanel> = {
  title: "Teaching/MemberTeachingPanel",
  component: MemberTeachingPanel,
  args: {
    organisation,
    onSave: async () => {},
    access: [
      {
        question_bank_id: "colonoscopy-optical-diagnosis",
        title: "Colonoscopy optical diagnosis",
        may_enter: true,
        missing: [],
        enrolment_ends_on: null,
      },
      {
        question_bank_id: "chest-xray-interpretation",
        title: "Chest X-ray interpretation",
        may_enter: false,
        missing: ["enrolment"],
        enrolment_ends_on: null,
      },
    ],
  },
};

export default meta;
type Story = StoryObj<typeof MemberTeachingPanel>;

/** Enrolled on one module and able to enter it; not on the other. */
export const Default: Story = {};

/** Enrolled, with no place at this centre. */
export const EnrolledWithoutAPlace: Story = {
  args: {
    access: [
      {
        question_bank_id: "colonoscopy-optical-diagnosis",
        title: "Colonoscopy optical diagnosis",
        may_enter: false,
        missing: ["place"],
        enrolment_ends_on: null,
      },
      {
        question_bank_id: "chest-xray-interpretation",
        title: "Chest X-ray interpretation",
        may_enter: false,
        missing: ["place", "enrolment"],
        enrolment_ends_on: null,
      },
    ],
  },
};

/** Somebody with nothing from teaching yet. */
export const NothingYet: Story = {
  args: {
    access: organisation.modules.map((module) => ({
      question_bank_id: module.id,
      title: module.title,
      may_enter: false,
      missing: ["competency", "place", "enrolment"],
      enrolment_ends_on: null,
    })),
  },
};

/** An enrolment with an end date. */
export const WithAnEndDate: Story = {
  args: {
    access: [
      {
        question_bank_id: "colonoscopy-optical-diagnosis",
        title: "Colonoscopy optical diagnosis",
        may_enter: true,
        missing: [],
        enrolment_ends_on: "2027-10-05T23:59:59Z",
      },
      {
        question_bank_id: "chest-xray-interpretation",
        title: "Chest X-ray interpretation",
        may_enter: false,
        missing: ["enrolment"],
        enrolment_ends_on: null,
      },
    ],
  },
};

/** In dark mode. */
export const Dark: Story = {
  globals: { colorScheme: "dark" },
};
