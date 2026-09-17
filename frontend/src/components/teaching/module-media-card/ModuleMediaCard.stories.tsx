/**
 * ModuleMediaCard Stories
 *
 * The admin's view of a module's videos, in each state it reaches:
 * everything linked, something missing, uploads left behind by a
 * renamed reference, and an upload in flight.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
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
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        The warning is the point: without it a mistyped reference hides the
        module from every learner with no trace an admin would see.
      </StoryNote>
    </Stack>
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
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        What a renamed or removed reference leaves behind. Without a row these
        are invisible bytes nobody can reach or remove.
      </StoryNote>
    </Stack>
  ),
};

export const UploadInProgress: Story = {
  args: {
    media: incomplete,
    uploadProgress: { debrief: 42 },
  },
  render: (args) => (
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        Uploading is the first of the same four stages the processing states
        below use, so one bar of one shape carries the whole job from the first
        byte to finished captions — and it sits under the file it is working on,
        rather than in a column of its own to read across to.
      </StoryNote>
      <StoryNote>
        The bar tracks the bytes within that first stage, so it moves during a
        long upload. There is no "X of 4" beside it: the stages are our own
        machinery rather than something the admin is working through, and the
        words underneath say what is happening. See "Every progress state" for
        several points of an upload side by side.
      </StoryNote>
    </Stack>
  ),
};

export const RowActions: Story = {
  args: {
    media: {
      module_id: "colonoscopy-optical-diagnosis",
      references: [
        { key: "lecture-01", asset: { ...lecture, has_captions: true } },
      ],
      unattached: [],
      is_complete: true,
    },
  },
  render: (args) => (
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        Open the menu at the end of the row for edit and delete, as the site and
        organisation tables do. Editing captions only appears where there are
        captions, so the menu never offers an action that does nothing.
      </StoryNote>
    </Stack>
  ),
};

export const DeleteWarnsAboutLiveOrganisations: Story = {
  args: {
    media: complete,
    liveOrganisations: ["East of England ETA", "Norfolk and Norwich"],
  },
  render: (args) => (
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        Open the menu at the end of a row and press delete to see the
        confirmation. It names the organisations the module is live for, because
        the admin cannot see that consequence from this page.
      </StoryNote>
    </Stack>
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
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        The page renders no card at all in this case — shown here only to pin
        the empty state.
      </StoryNote>
    </Stack>
  ),
};

export const UploadFailed: Story = {
  args: {
    media: incomplete,
    error: "Media upload is not configured",
  },
  render: (args) => (
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        What a failed upload, delete or load says. Shown rather than swallowed:
        an upload that fails silently is indistinguishable from a button that
        does nothing, and the admin has no other way to find out. This
        particular message means the deployment has no media bucket.
      </StoryNote>
    </Stack>
  ),
};

export const UploadFailedOnACompleteModule: Story = {
  args: {
    media: complete,
    error: "Upload failed",
  },
  render: (args) => (
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        A complete module shows no missing-media warning, so the error stands
        alone. The two are independent: one says what is absent, the other says
        what just went wrong.
      </StoryNote>
    </Stack>
  ),
};

export const Loading: Story = {
  args: { media: complete, loading: true },
};

// ------------------------------------------------------------------
// Processing states
//
// The card used to say "No captions" for every one of these, which
// states absence where the truth was usually "not yet" — and had
// someone re-upload a video that was working perfectly.
// ------------------------------------------------------------------

const processing = (
  key: string,
  progress: MediaAsset["progress"],
): ModuleMedia => ({
  module_id: "colonoscopy-optical-diagnosis",
  references: [{ key, asset: { ...lecture, progress } }],
  unattached: [],
  is_complete: true,
});

/**
 * Every state the File column reaches, as one table.
 *
 * The labels are copied verbatim from `describe_progress` in
 * `backend/app/features/teaching/media.py`, which is the only place
 * that decides them — so if the wording here looks wrong, it is the
 * wording an admin actually sees.
 *
 * Stacked in one table on purpose: the fault this column was built to
 * fix was a bar that changed shape and shifted sideways between
 * stages, and that is invisible in a story showing one row at a time.
 */
export const EveryProgressState: Story = {
  args: {
    media: {
      module_id: "colonoscopy-optical-diagnosis",
      references: [
        { key: "uploading-4", asset: null },
        { key: "uploading-42", asset: null },
        { key: "uploading-88", asset: null },
        {
          key: "preparing",
          asset: {
            ...lecture,
            asset_id: "s1",
            progress: {
              stage: 1,
              total_stages: 4,
              label: "Preparing the video",
              in_progress: true,
              stalled: false,
            },
          },
        },
        {
          key: "not-started",
          asset: {
            ...lecture,
            asset_id: "s2",
            progress: {
              stage: 1,
              total_stages: 4,
              label: "Uploaded — processing has not started",
              in_progress: false,
              stalled: false,
            },
          },
        },
        {
          key: "processing-failed",
          asset: {
            ...lecture,
            asset_id: "s3",
            progress: {
              stage: 1,
              total_stages: 4,
              label: "Processing seems to have failed",
              in_progress: false,
              stalled: true,
            },
          },
        },
        {
          key: "writing-captions",
          asset: {
            ...lecture,
            asset_id: "s4",
            progress: {
              stage: 2,
              total_stages: 4,
              label: "Writing captions",
              in_progress: true,
              stalled: false,
            },
          },
        },
        {
          key: "captions-not-started",
          asset: {
            ...lecture,
            asset_id: "s5",
            progress: {
              stage: 2,
              total_stages: 4,
              label: "Video ready — captions have not started",
              in_progress: false,
              stalled: false,
            },
          },
        },
        {
          key: "captions-failed",
          asset: {
            ...lecture,
            asset_id: "s6",
            progress: {
              stage: 2,
              total_stages: 4,
              label: "Video ready — captions seem to have failed",
              in_progress: false,
              stalled: true,
            },
          },
        },
        {
          key: "captions-need-checking",
          asset: {
            ...lecture,
            asset_id: "s7",
            has_captions: true,
            captions_reviewed_at: null,
            progress: {
              stage: 3,
              total_stages: 4,
              label: "Ready — captions need checking",
              in_progress: false,
              stalled: false,
            },
          },
        },
        {
          key: "captions-checked",
          asset: {
            ...lecture,
            asset_id: "s8",
            has_captions: true,
            captions_reviewed_at: "2026-09-16T11:20:00Z",
            progress: {
              stage: 4,
              total_stages: 4,
              label: "Ready — captions checked",
              in_progress: false,
              stalled: false,
            },
          },
        },
      ],
      unattached: [],
      is_complete: false,
    },
    uploadProgress: {
      "uploading-4": 4,
      "uploading-42": 42,
      "uploading-88": 88,
    },
  },
  render: (args) => (
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        Read down the File column. The bar sits directly under the name of the
        file it is working on, so there is nothing to read across to. One bar of
        the same shape in the same place for every row that is still going, from
        uploading through to captions awaiting a read — eleven rows, of which
        only the last is finished and so has no bar.
      </StoryNote>
      <StoryNote>
        The first three rows are uploads in flight, a twentieth, two fifths and
        seven eighths of the way through the file. The bar creeps across the
        first of the four stages as the bytes go up, because a 900MB lecture
        holds that stage for minutes and a bar that does not move in that time
        looks like one that has stopped. No numbers either way — neither a
        percentage nor an "X of 4" — because the bar's length and the words
        beneath it are the whole story, and counting stages invites the question
        of what the four are.
      </StoryNote>
      <StoryNote>
        The two red lines are the states where waiting will not help: something
        started and has overrun what it plausibly needs. The two plain ones
        reading "has not started" mean nothing is coming at all, which looked
        identical to the working states before the start times were recorded.
      </StoryNote>
      <StoryNote>
        The last row has no bar, only a grey line reading "Ready — captions
        checked". That is the end of the job, and it is the row an admin sees
        for the rest of the video's life, so it reads as settled rather than as
        something to attend to. A full bar left on a finished row would read as
        something still running.
      </StoryNote>
      <StoryNote>
        The row above it keeps its bar, because stage three is not the end:
        Whisper mishears clinical terminology, so machine output is a draft
        until a person has read it and a learner relying on it cannot tell the
        difference. "Ready — captions need checking" says so in words, which is
        why there is no separate badge for it.
      </StoryNote>
    </Stack>
  ),
};

export const PreparingTheVideo: Story = {
  args: {
    media: processing("lecture-01", {
      stage: 1,
      total_stages: 4,
      label: "Preparing the video",
      in_progress: true,
    }),
  },
  render: (args) => (
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        Straight after upload, while the video is being converted. The bar says
        how far along it is and the line says what is happening, so nobody has
        to guess whether anything is running.
      </StoryNote>
    </Stack>
  ),
};

export const WritingCaptions: Story = {
  args: {
    media: processing("lecture-01", {
      stage: 2,
      total_stages: 4,
      label: "Writing captions",
      in_progress: true,
    }),
  },
  render: (args) => (
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        The video already plays; only the captions are outstanding. This is the
        state that used to read "No captions", which is true and useless.
      </StoryNote>
    </Stack>
  ),
};

export const CaptionsNeverStarted: Story = {
  args: {
    media: processing("lecture-01", {
      stage: 2,
      total_stages: 4,
      label: "Video ready — captions have not started",
      in_progress: false,
    }),
  },
  render: (args) => (
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        Nothing is coming. This lasted two days once, while the captioning was
        switched off, and looked exactly like the state above. Saying so is the
        whole reason the start times are recorded.
      </StoryNote>
    </Stack>
  ),
};

export const ProcessingStalled: Story = {
  args: {
    media: processing("lecture-01", {
      stage: 1,
      total_stages: 4,
      label: "Processing seems to have failed",
      in_progress: false,
      stalled: true,
    }),
  },
  render: (args) => (
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        Started, and running far longer than it plausibly needs. Coloured as an
        alert, because waiting will not fix it.
      </StoryNote>
    </Stack>
  ),
};
