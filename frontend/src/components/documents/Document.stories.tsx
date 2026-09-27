import type { Meta, StoryObj } from "@storybook/react-vite";
import { Document } from "./Document";
import publicAsset from "@lib/publicAsset";

const meta: Meta<typeof Document> = {
  title: "Documents/Document",
  component: Document,
};

export default meta;
type Story = StoryObj<typeof Document>;

export const PDF: Story = {
  args: {
    name: "External clinical letter",
    type: "pdf",
    url: publicAsset("/mock-documents/1_external_clinical_letter.pdf"),
  },
};

export const DarkMode: Story = {
  ...PDF,
  globals: { colorScheme: "dark" },
};
