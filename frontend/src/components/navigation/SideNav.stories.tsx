import type { Meta, StoryObj } from "@storybook/react-vite";
import SideNav from "./SideNav";
import "./SideNav.modules.scss";

const meta: Meta<typeof SideNav> = {
  title: "Navigation/SideNav",
  component: SideNav,
};
export default meta;

type Story = StoryObj<typeof SideNav>;

/** Default sidebar with search visible */
export const WithSearch: Story = {
  render: (args) => (
    <div className="story-layout">
      <div className="story-sidenav">
        <SideNav {...args} />
      </div>
      <div className="story-content">
        Desktop content area. Resize the preview to see the nav hide.
      </div>
    </div>
  ),
  args: { showSearch: true },
};

/** Sidebar without search */
export const WithoutSearch: Story = {
  render: (args) => (
    <div className="story-layout">
      <div className="story-sidenav">
        <SideNav {...args} />
      </div>
      <div className="story-content">
        Desktop content area. Resize the preview to see the nav hide.
      </div>
    </div>
  ),
  args: { showSearch: false },
};
