import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentThumbnail } from "./DocumentThumbnail";

const meta: Meta<typeof DocumentThumbnail> = {
  title: "Documents/DocumentThumbnail",
  component: DocumentThumbnail,
};
export default meta;
type Story = StoryObj<typeof DocumentThumbnail>;

export const Default: Story = {
  args: {
    src: "/mock-documents/thumbnails/1_external_clinical_letter.pdf.png",
    alt: "External clinical letter",
  },
};

export const Loading: Story = {
  args: {
    src: "",
    alt: "",
    loading: true,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
