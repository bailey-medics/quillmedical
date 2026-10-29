/**
 * Add staff form stories.
 *
 * The card opens with the lookup alone. Each story answers the lookup
 * its own way, through the `onLookUp` prop rather than a request, and
 * looks somebody up as it opens, so it shows what that answer brings up.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { expect, userEvent, within } from "storybook/test";
import type { MemberLookup as Result } from "@/domains/orgUnit";
import AddStaffForm from "./AddStaffForm";

/** Already staff somewhere: no grant needed, no question asked. */
const A_NURSE = {
  id: 9,
  username: "a.patel",
  full_name: "Anita Patel",
  competencies: ["access_patient_records"],
};

/** Holds only their own record: offered a profession, and asked about. */
const A_PATIENT = {
  id: 2,
  username: "j.smith",
  full_name: "Jane Smith",
  competencies: ["access_own_patient_records"],
};

/** Answer every lookup the same way, at once. */
const answering = (result: Result) => async () => result;

/** Look somebody up, as the reader would. */
async function lookUp(canvasElement: HTMLElement, term: string) {
  const canvas = within(canvasElement);

  await userEvent.type(
    canvas.getByLabelText(/username or email address/i),
    term,
  );
  await userEvent.click(canvas.getByRole("button", { name: "Find" }));

  return canvas;
}

const meta: Meta<typeof AddStaffForm> = {
  title: "Form/Add staff form",
  component: AddStaffForm,
  parameters: { layout: "padded" },
  args: {
    placeName: "Oncology",
    placeKind: "site",
    onLookUp: answering({ status: "found", user: A_NURSE }),
    onCreate: () => {},
    roleOptions: [
      { value: "clinical_lead", label: "Clinical lead" },
      { value: "staff", label: "Staff" },
      { value: "trainee", label: "Trainee" },
    ],
    onSubmit: async () => ({
      state: "success",
      message: { title: "Staff member added" },
    }),
    onCancel: () => {},
  },
  decorators: [
    (Story) => (
      <Box maw={720}>
        <Story />
      </Box>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof AddStaffForm>;

/** As the page opens: the lookup, and nothing else yet. */
export const Default: Story = {};

/** Somebody already staff elsewhere: a role, then Add staff member. */
export const FoundStaff: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await lookUp(canvasElement, "a.patel@example.org");

    await expect(
      await canvas.findByPlaceholderText("Select a role"),
    ).toBeInTheDocument();
  },
};

/** Somebody holding nothing staff-like: offered a profession too. */
export const FoundNotYetStaff: Story = {
  args: { onLookUp: answering({ status: "found", user: A_PATIENT }) },
  play: async ({ canvasElement }) => {
    const canvas = await lookUp(canvasElement, "j.smith");

    await expect(
      await canvas.findByText(/holds nothing a member of staff would/),
    ).toBeInTheDocument();
  },
};

/** An organisation offers no role: found, then straight to the button. */
export const FoundWithoutRoles: Story = {
  args: { placeKind: "organisation", roleOptions: undefined },
  play: async ({ canvasElement }) => {
    const canvas = await lookUp(canvasElement, "a.patel@example.org");

    await expect(
      await canvas.findByRole("button", { name: "Add staff member" }),
    ).toBeInTheDocument();
  },
};

/** Nobody has the address: creating them is offered, and nothing more. */
export const NotFound: Story = {
  args: { onLookUp: answering({ status: "not_found", user: null }) },
  play: async ({ canvasElement }) => {
    const canvas = await lookUp(canvasElement, "new.person@example.org");

    await expect(
      await canvas.findByRole("button", { name: "Create new user" }),
    ).toBeInTheDocument();
  },
};

/** Somebody already here: the lookup says so, and offers nothing. */
export const AlreadyHere: Story = {
  args: {
    onLookUp: answering({ status: "already_member", user: A_NURSE }),
  },
  play: async ({ canvasElement }) => {
    const canvas = await lookUp(canvasElement, "a.patel@example.org");

    await expect(
      await canvas.findByText(/is already at Oncology/),
    ).toBeInTheDocument();
  },
};

export const DarkMode: Story = {
  ...FoundNotYetStaff,
  globals: { colorScheme: "dark" },
};
