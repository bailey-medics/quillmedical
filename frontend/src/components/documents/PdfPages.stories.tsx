import type { Meta, StoryObj } from "@storybook/react-vite";
import PdfPages from "./PdfPages";
import publicAsset from "@lib/publicAsset";

const meta: Meta<typeof PdfPages> = {
  title: "Documents/PDF pages",
  component: PdfPages,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof PdfPages>;

export const ThreePages: Story = {
  args: {
    name: "Example letter",
    url: publicAsset("/mock-documents/6_three_page_letter.pdf"),
  },
};

export const ClinicLetter: Story = {
  args: {
    name: "External clinical letter",
    url: publicAsset("/mock-documents/1_external_clinical_letter.pdf"),
  },
};

/** A file that is not a PDF at all, which pdf.js refuses to open. */
export const CannotBeShown: Story = {
  args: {
    name: "Broken file",
    url: publicAsset(
      "/mock-documents/thumbnails/1_external_clinical_letter.pdf.png",
    ),
  },
};

export const DarkMode: Story = {
  ...ThreePages,
  globals: { colorScheme: "dark" },
};
