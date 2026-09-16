/**
 * CertificateUploader Stories
 *
 * The drop target for a scanned certificate. Uploading is deliberately
 * separate from `CertificateForm`: a network drop halfway through a scan
 * must not cost somebody a filled-in form, so the page composes the two
 * rather than nesting them.
 *
 * The stories do not upload anything — `uploadEvidence` would need a
 * backend — so what they show is the resting state and the wording.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import CertificateUploader from "./CertificateUploader";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof CertificateUploader> = {
  title: "Passport/CertificateUploader",
  component: CertificateUploader,
  parameters: { layout: "padded" },
  args: {
    passportId: "3f2a8c1e",
    onUploaded: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof CertificateUploader>;

export const Default: Story = {
  render: (args) => (
    <Stack gap="sm">
      <CertificateUploader {...args} />
      <StoryNote>
        The same box the teaching media card uses, with the passport's own
        allow-list. The type is checked here before a byte leaves the browser,
        and again by the backend before a blob is stored.
      </StoryNote>
    </Stack>
  ),
};
