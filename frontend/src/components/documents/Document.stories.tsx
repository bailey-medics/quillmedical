import type { Meta, StoryObj } from "@storybook/react-vite";
import { Document } from "./Document";
import publicAsset from "@lib/publicAsset";

const meta: Meta<typeof Document> = {
  title: "Documents/Document",
  component: Document,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Document>;

/**
 * Makes the browser say it has no PDF viewer for one story, as Chrome
 * on Android does, so `Document` draws the pages itself. Put back when
 * the story is left.
 */
function withoutNativePdfViewer() {
  // An own property on `navigator`, shadowing the real one on its
  // prototype. Deleting it afterwards uncovers the real one again.
  Object.defineProperty(navigator, "pdfViewerEnabled", {
    configurable: true,
    get: () => false,
  });
  return () => {
    Reflect.deleteProperty(navigator, "pdfViewerEnabled");
  };
}

/** A desktop browser frames the PDF in its own viewer. */
export const PDF: Story = {
  args: {
    name: "External clinical letter",
    type: "pdf",
    url: publicAsset("/mock-documents/1_external_clinical_letter.pdf"),
  },
};

/**
 * What a phone or tablet gets: every page drawn with pdf.js, forced
 * here so it can be seen on a desktop.
 */
export const PDFDrawnPageByPage: Story = {
  args: {
    name: "Example letter",
    type: "pdf",
    url: publicAsset("/mock-documents/6_three_page_letter.pdf"),
  },
  beforeEach: withoutNativePdfViewer,
};

export const Picture: Story = {
  args: {
    name: "External clinical letter, first page",
    type: "image",
    url: publicAsset(
      "/mock-documents/thumbnails/1_external_clinical_letter.pdf.png",
    ),
  },
};

export const DarkMode: Story = {
  ...PDF,
  globals: { colorScheme: "dark" },
};
