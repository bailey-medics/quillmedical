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
  original_filename: "Echocardiogram_overview.mp4",
  content_type: "video/mp4",
  size_bytes: 943718400,
  uploaded_at: "2026-09-02T09:14:00Z",
};

const debrief: MediaAsset = {
  asset_id: "d4e5f6",
  original_filename: "Echocardiogram_panel_debrief.mp4",
  content_type: "video/mp4",
  size_bytes: 412876800,
  uploaded_at: "2026-09-02T10:02:00Z",
};

const orphan: MediaAsset = {
  asset_id: "z9y8x7",
  original_filename: "Echocardiogram_old_intro_take2.mov",
  content_type: "video/quicktime",
  size_bytes: 88080384,
  uploaded_at: "2026-08-19T16:40:00Z",
};

const complete: ModuleMedia = {
  module_id: "echocardiography-interpretation",
  references: [
    { key: "lecture-01", asset: lecture },
    { key: "debrief", asset: debrief },
  ],
  unattached: [],
  is_complete: true,
};

const incomplete: ModuleMedia = {
  module_id: "echocardiography-interpretation",
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
      module_id: "echocardiography-interpretation",
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
    uploadNames: { debrief: "Echocardiogram_panel_debrief_take4.mp4" },
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
      module_id: "echocardiography-interpretation",
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

export const OneRowsUploadFailed: Story = {
  args: {
    media: {
      module_id: "echocardiography-interpretation",
      references: [
        { key: "lecture-01", asset: null },
        { key: "debrief", asset: null },
      ],
      unattached: [],
      is_complete: false,
    },
    uploadErrors: {
      "lecture-01":
        "The server could not accept the upload (500). This is not a problem with your file — try again shortly.",
    },
  },
  render: (args) => (
    <Stack gap="sm">
      <ModuleMediaCard {...args} />
      <StoryNote>
        The row that failed is the row that says so, and the dropzone stays
        beneath it. A failed upload leaves nothing behind — no partial file and
        no half-made asset — so trying again is a clean slate rather than a
        resume. The second row is untouched, which is the point of keeping this
        per reference key rather than one message for the card.
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
  module_id: "echocardiography-interpretation",
  references: [{ key, asset: { ...lecture, progress } }],
  unattached: [],
  is_complete: true,
});

/**
 * Every state the File column reaches, as one table.
 *
 * The labels are copied verbatim from `describe_progress` in
 * `backend/app/features/teaching/media.py`, which is the only org_unit
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
      module_id: "echocardiography-interpretation",
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
          key: "plays-without-processing",
          asset: {
            ...lecture,
            asset_id: "s1b",
            progress: {
              // Development, where no transcode job is configured. The
              // upload plays as it is and nothing further is coming, so
              // the row is finished and shows no bar.
              stage: 1,
              total_stages: 4,
              label: "Uploaded — plays without processing",
              in_progress: false,
              stalled: false,
              is_final: true,
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
              label: "Captions need checking — hidden from learners until then",
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
    /* The same name on every row, so nothing but the bar and the line
       beneath it differs down the column. This story exists to compare
       the states against each other, and varying the file names made
       the rows look like different videos rather than one video's
       progress shown eleven ways. */
    uploadNames: {
      "uploading-4": "Echocardiogram_overview.mp4",
      "uploading-42": "Echocardiogram_overview.mp4",
      "uploading-88": "Echocardiogram_overview.mp4",
    },
  },
};

/**
 * The same states in a narrow viewport.
 *
 * The bar used to size itself to whatever else was in the cell, so a
 * long file name gave a full-width bar and a short one a half-width
 * bar — two lengths in one column, neither meaning anything.
 */
export const NarrowScreen: Story = {
  ...EveryProgressState,
  render: (args) => (
    /* Constrained here rather than through a viewport setting: this
       Storybook has no viewport addon configured, so one would type
       check, run, and change nothing at all. */
    <Stack gap="sm" maw="30rem">
      <ModuleMediaCard {...args} />
      <StoryNote>
        Every bar is the same width, whatever sits above it. The bars should all
        start and end in line, whether the row holds a long file name or a short
        one.
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
