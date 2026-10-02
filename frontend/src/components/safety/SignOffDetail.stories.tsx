/**
 * SignOffDetail Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import SignOffDetail from "./SignOffDetail";
import { SAFETY_CASES } from "@lib/safety";

const safetyCase = SAFETY_CASES[0];

function args(sectionId: string) {
  const item = safetyCase.sign_off.find((s) => s.id === sectionId)!;
  return {
    item,
    documents: safetyCase.documents.filter((d) => item.reviews.includes(d.id)),
    documentHref: (document: { id: string }) =>
      `/safety/${safetyCase.id}/documentation/${document.id}`,
  };
}

const meta: Meta<typeof SignOffDetail> = {
  title: "Safety/Sign-off detail",
  component: SignOffDetail,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof SignOffDetail>;

export const Signed: Story = { args: args("crmp") };
export const Awaiting: Story = { args: args("approval") };

export const DarkMode: Story = {
  ...Awaiting,
  globals: { colorScheme: "dark" },
};
