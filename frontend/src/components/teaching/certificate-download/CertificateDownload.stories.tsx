import type { Meta, StoryObj } from "@storybook/react-vite";
import { CertificateDownload } from "./CertificateDownload";

const meta: Meta<typeof CertificateDownload> = {
  title: "Teaching/CertificateDownload",
  component: CertificateDownload,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof CertificateDownload>;

export const Default: Story = {
  args: {
    assessmentId: 42,
  },
};
