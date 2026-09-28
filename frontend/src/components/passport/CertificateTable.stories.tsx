/**
 * CertificateTable Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import CertificateTable from "./CertificateTable";
import { certificates } from "./fixtures";

const meta: Meta<typeof CertificateTable> = {
  title: "Passport/Certificate table",
  component: CertificateTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof CertificateTable>;

export const Default: Story = {
  args: { certificates, onSelect: fn() },
};

export const Empty: Story = {
  args: { certificates: [], onSelect: fn() },
};

export const Loading: Story = {
  args: { certificates: [], isLoading: true, onSelect: fn() },
};
