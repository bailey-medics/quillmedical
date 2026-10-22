import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import ChooseSiteForm from "./ChooseSiteForm";

const twoSites = [
  { value: "1", label: "Northfield General Hospital" },
  { value: "2", label: "Riverside Community Hospital" },
];

const meta: Meta<typeof ChooseSiteForm> = {
  title: "Registration/Choose site form",
  component: ChooseSiteForm,
  parameters: { layout: "padded" },
  args: {
    sites: twoSites,
    onSubmit: () => new Promise(() => {}),
    onBack: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** A clinical lead at two sites, as the join guide shows it. */
export const TwoSites: Story = {};

/** A clinical lead at three sites. */
export const ThreeSites: Story = {
  args: {
    sites: [...twoSites, { value: "3", label: "St Anne's Day Unit" }],
  },
};

/** A site chosen, so Continue is ready to press. */
export const SiteChosen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("radio", { name: "Riverside Community Hospital" }),
    );
  },
};

export const DarkMode: Story = {
  ...TwoSites,
  globals: { colorScheme: "dark" },
};
