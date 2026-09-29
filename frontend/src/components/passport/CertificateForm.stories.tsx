/**
 * CertificateForm stories.
 *
 * Shown with and without evidence attached, because the two are
 * genuinely different states: not every course issues a document, and a
 * certificate with no scan is still a record worth keeping.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import CertificateForm from "./CertificateForm";
import { certificates } from "./fixtures";
import { StoryNote } from "@/stories/variants";
import type { AttachmentInput } from "@lib/passport";

const uploaded: AttachmentInput = {
  hash: "sha256:" + "ab".repeat(32),
  filename: "als-certificate.pdf",
  size_bytes: 184320,
  media_type: "application/pdf",
};

const meta = {
  title: "Passport/CertificateForm",
  component: CertificateForm,
  parameters: { layout: "padded" },
  // `satisfies Meta<>` makes a required prop mandatory in `args` rather
  // than letting Storybook's `argTypesRegex` fill it in, so the handler
  // is declared once here and every story inherits it.
  args: { onSubmit: () => {} },
} satisfies Meta<typeof CertificateForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithEvidence: Story = {
  args: { attachments: [uploaded] },
};

/**
 * Correcting a certificate already recorded: the form is filled in, and
 * the file on the record can be taken off.
 */
export const Editing: Story = {
  args: {
    initial: certificates[0],
    attachments: [uploaded],
    onRemoveAttachment: () => {},
    uploader: <StoryNote>The upload box sits here, above the file.</StoryNote>,
  },
};

export const Submitting: Story = {
  args: { attachments: [uploaded], isSubmitting: true },
};
