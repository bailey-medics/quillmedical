/**
 * ModuleMediaCard Stories
 *
 * The admin's view of a module's videos, in each state it reaches:
 * everything linked, something missing, uploads left behind by a
 * renamed reference, and an upload in flight.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import ModuleMediaCard from "./ModuleMediaCard";
import type { MediaAsset, ModuleMedia } from "@/features/teaching/types";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof ModuleMediaCard> = {
  title: "Teaching/Module media card",
  component: ModuleMediaCard,
  parameters: {
    layout: "padded",
  },
};

export default meta;

type Story = StoryObj<typeof ModuleMediaCard>;

// ------------------------------------------------------------------
// Test data
// ------------------------------------------------------------------

const lecture: MediaAsset = {
  asset_id: "a1b2c3",
  original_filename: "EoEETA_Colonoscopy_FINAL_v3.mp4",
  content_type: "video/mp4",
  size_bytes: 943718400,
  uploaded_at: "2026-09-02T09:14:00Z",
};

const debrief: MediaAsset = {
  asset_id: "d4e5f6",
  original_filename: "Panel_debrief.mp4",
  content_type: "video/mp4",
  size_bytes: 412876800,
  uploaded_at: "2026-09-02T10:02:00Z",
};

const orphan: MediaAsset = {
  asset_id: "z9y8x7",
  original_filename: "old_intro_take2.mov",
  content_type: "video/quicktime",
  size_bytes: 88080384,
  uploaded_at: "2026-08-19T16:40:00Z",
};

const complete: ModuleMedia = {
  module_id: "colonoscopy-optical-diagnosis",
  references: [
    { key: "lecture-01", asset: lecture },
    { key: "debrief", asset: debrief },
  ],
  unattached: [],
  is_complete: true,
};

const incomplete: ModuleMedia = {
  module_id: "colonoscopy-optical-diagnosis",
  references: [
    { key: "lecture-01", asset: lecture },
    { key: "debrief", asset: null },
  ],
  unattached: [],
  is_complete: false,
};

// ------------------------------------------------------------------
// Stories
// ------------------------------------------------------------------

export const AllLinked: Story = {
  args: { media: complete },
};

export const SomethingMissing: Story = {
  args: {
    media: incomplete,
    liveOrganisations: ["East of England ETA"],
  },
  render: (args) => (
    <>
      <ModuleMediaCard {...args} />
      <StoryNote>
        The warning is the point: without it a mistyped reference hides the
        module from every learner with no trace an admin would see.
      </StoryNote>
    </>
  ),
};

export const NothingUploadedYet: Story = {
  args: {
    media: {
      module_id: "colonoscopy-optical-diagnosis",
      references: [
        { key: "lecture-01", asset: null },
        { key: "debrief", asset: null },
      ],
      unattached: [],
      is_complete: false,
    },
  },
};

export const UnattachedUploads: Story = {
  args: {
    media: { ...incomplete, unattached: [orphan] },
  },
  render: (args) => (
    <>
      <ModuleMediaCard {...args} />
      <StoryNote>
        What a renamed or removed reference leaves behind. Without a row these
        are invisible bytes nobody can reach or remove.
      </StoryNote>
    </>
  ),
};

export const UploadInProgress: Story = {
  args: {
    media: incomplete,
    uploadProgress: { debrief: 42 },
  },
};

export const DeleteWarnsAboutLiveOrganisations: Story = {
  args: {
    media: complete,
    liveOrganisations: ["East of England ETA", "Norfolk and Norwich"],
  },
  render: (args) => (
    <>
      <ModuleMediaCard {...args} />
      <StoryNote>
        Press delete to see the confirmation. It names the organisations the
        module is live for, because the admin cannot see that consequence from
        this page.
      </StoryNote>
    </>
  ),
};

export const NoMediaReferenced: Story = {
  args: {
    media: {
      module_id: "pure-text-module",
      references: [],
      unattached: [],
      is_complete: true,
    },
  },
  render: (args) => (
    <>
      <ModuleMediaCard {...args} />
      <StoryNote>
        The page renders no card at all in this case — shown here only to pin
        the empty state.
      </StoryNote>
    </>
  ),
};

export const Loading: Story = {
  args: { media: complete, loading: true },
};
