/**
 * EvidenceScanStatus Stories
 *
 * The line beneath the certificate drop area, in each of the states a
 * malware scan can leave an upload in.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import EvidenceScanStatus from "./EvidenceScanStatus";
import { StoryNote, VariantRow, VariantStack } from "@/stories/variants";

const meta: Meta<typeof EvidenceScanStatus> = {
  title: "Passport/EvidenceScanStatus",
  component: EvidenceScanStatus,
  parameters: { layout: "padded" },
  args: {
    status: "attached",
    filename: "als-certificate.pdf",
  },
};

export default meta;

type Story = StoryObj<typeof EvidenceScanStatus>;

export const Attached: Story = {};

export const MalwareFound: Story = {
  args: {
    status: "malware",
    filename: "eicar-in-a-pdf.pdf",
    signature: "Eicar-Signature",
  },
};

export const CouldNotBeChecked: Story = {
  args: { status: "failed" },
};

export const StillBeingChecked: Story = {
  args: { status: "slow" },
};

export const AllStates: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="checking" horizontal={false}>
        <EvidenceScanStatus status="checking" filename="als-certificate.pdf" />
      </VariantRow>
      <VariantRow label="attached" horizontal={false}>
        <EvidenceScanStatus status="attached" filename="als-certificate.pdf" />
      </VariantRow>
      <VariantRow label="slow" horizontal={false}>
        <EvidenceScanStatus status="slow" filename="als-certificate.pdf" />
      </VariantRow>
      <VariantRow label="malware" horizontal={false}>
        <EvidenceScanStatus
          status="malware"
          filename="eicar-in-a-pdf.pdf"
          signature="Eicar-Signature"
        />
      </VariantRow>
      <VariantRow label="failed" horizontal={false}>
        <EvidenceScanStatus status="failed" filename="scan.pdf" />
      </VariantRow>
      <StoryNote>
        Every upload is scanned before it can be shown. Only `attached` and
        `slow` hand the file to the form; `slow` is a scan with no verdict after
        two minutes, still held back wherever it would be shown.
      </StoryNote>
    </VariantStack>
  ),
};

// The wait comes last, as loading states do in every stories file here.
export const Checking: Story = {
  args: { status: "checking" },
};
