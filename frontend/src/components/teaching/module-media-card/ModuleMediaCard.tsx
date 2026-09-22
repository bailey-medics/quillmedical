/**
 * ModuleMediaCard
 *
 * The admin's view of a module's video files: one row per `<Video ref>`
 * the content carries, showing either the uploaded file or that nothing
 * is linked yet.
 *
 * Rendered only when the module's content references media, so a module
 * of pure text never shows it. Whether media is needed is derived from
 * the content itself, never from a flag an author sets — a boolean in a
 * file nobody reopens is a second source of truth that can disagree
 * with the slides.
 *
 * Presentational. Upload, link and delete are all handed upward, so the
 * card can be driven from Storybook with no network at all.
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal";
import DataTable from "@/components/tables/DataTable";
import EllipsisMenu from "@/components/ellipsis-menu/EllipsisMenu";
import { StateMessage } from "@/components/message-cards";
import {
  IconAlertTriangle,
  IconPencil,
  IconTrash,
} from "@/components/icons/appIcons";
import { BodyText, BodyTextInline, Heading } from "@/components/typography";
import { TeachingProgressBar } from "@/components/teaching/teaching-progress-bar";
import type { MediaAsset, ModuleMedia } from "@/features/teaching/types";
import MediaDropzone from "./MediaDropzone";

export interface ModuleMediaCardProps {
  /** References and uploads for one module, from the media endpoint. */
  media: ModuleMedia;
  /**
   * Organisations the module is live for.
   *
   * Named in the delete confirmation, because deleting a file hides the
   * module from those learners and the admin cannot see that
   * consequence from this page.
   */
  liveOrganisations?: string[];
  /** Upload progress 0–100 for one reference key, while in flight. */
  uploadProgress?: Record<string, number>;
  /**
   * Name of the file being uploaded, per reference key.
   *
   * Comes from the dropped file, because the asset it will become does
   * not exist until the upload finishes. Without it the row can only
   * say something is on its way, not what.
   */
  uploadNames?: Record<string, string>;
  /**
   * Why the last upload against a reference key failed, if it did.
   *
   * Per key rather than one message for the whole card, so the row
   * that failed is the row that says so. Without it a failed upload
   * silently returns the row to an empty dropzone, which looks
   * identical to never having tried.
   */
  uploadErrors?: Record<string, string>;
  /** Called with the file dropped against a reference key. */
  onUpload?: (key: string, file: File) => void;
  /** Called once the admin has confirmed removing an asset. */
  onDelete?: (assetId: string) => void | Promise<void>;
  /**
   * Called to open the caption editor for one asset.
   *
   * Handed upward like every other action here, so the card stays
   * presentational and can be driven from Storybook with no network.
   */
  onEditCaptions?: (asset: MediaAsset) => void;
  /** Shows skeleton rows while the media list is in flight. */
  loading?: boolean;
  /**
   * What went wrong with the last upload, delete or load.
   *
   * Shown rather than swallowed: an upload that fails silently is
   * indistinguishable from a button that does nothing, and the admin
   * has no other way to find out. A 503 here means the deployment has
   * no media bucket configured, which is the answer they need.
   */
  error?: string | null;
}

interface Row {
  key: string;
  asset: MediaAsset | null;
  /** Unattached uploads have no reference to sit against. */
  unattached: boolean;
}

export default function ModuleMediaCard({
  media,
  liveOrganisations = [],
  uploadProgress = {},
  uploadNames = {},
  uploadErrors = {},
  onUpload,
  onDelete,
  onEditCaptions,
  loading = false,
  error = null,
}: ModuleMediaCardProps) {
  const [pendingDelete, setPendingDelete] = useState<MediaAsset | null>(null);

  const rows: Row[] = [
    ...media.references.map((r) => ({
      key: r.key,
      asset: r.asset,
      unattached: false,
    })),
    ...media.unattached.map((a) => ({
      key: a.original_filename,
      asset: a,
      unattached: true,
    })),
  ];

  const missing = media.references.filter((r) => r.asset === null).length;

  return (
    <BaseCard>
      <Stack gap="sm">
        <Heading>Videos</Heading>

        {/* The gate fails safe, but it must not fail invisibly: without
            this line a typo in a reference hides the module from every
            learner with the only trace on a card nobody has opened. */}
        {!media.is_complete && (
          <StateMessage
            icon={<IconAlertTriangle />}
            colour="warning"
            title={
              missing === 1
                ? "1 video is missing"
                : `${missing} videos are missing`
            }
            description={
              liveOrganisations.length > 0
                ? `This module is not available to learners in ${liveOrganisations.join(
                    ", ",
                  )} until every video is uploaded.`
                : "This module will not be available to learners until every video is uploaded."
            }
          />
        )}

        {error && (
          <StateMessage
            icon={<IconAlertTriangle />}
            colour="alert"
            title="Something went wrong"
            description={error}
          />
        )}

        <DataTable
          data={rows}
          loading={loading}
          getRowKey={(row) => `${row.unattached ? "un:" : "ref:"}${row.key}`}
          emptyMessage="This module references no videos"
          columns={[
            {
              header: "Reference",
              render: (row) => (row.unattached ? "Not referenced" : row.key),
            },
            {
              // The file and what is happening to it, in one cell: the
              // bar sits directly under the name of the thing it is
              // working on, so there is nothing to read across to.
              header: "File",
              render: (row) => {
                const percent = uploadProgress[row.key];
                const failed = uploadErrors[row.key];

                // Nothing uploaded and nothing on its way.
                if (!row.asset && percent === undefined) {
                  // A failed upload leaves nothing behind — no partial
                  // file, no half-made asset — so the dropzone below is
                  // a genuine clean slate. What it is not is
                  // self-explanatory: an empty row looks the same
                  // whether the upload failed or was never attempted,
                  // which is how a 503 came to look like a dead button.
                  return (
                    <Stack gap={4}>
                      {failed ? (
                        <BodyTextInline c="var(--alert-color)">
                          {failed} Nothing was saved — try again.
                        </BodyTextInline>
                      ) : null}
                      <MediaDropzone
                        onDrop={(file) => onUpload?.(row.key, file)}
                      />
                    </Stack>
                  );
                }

                // The bar goes once nothing further is expected: that
                // is the end of the job, and a full bar left on a
                // finished row reads as something still running. It is
                // the row an admin sees for the rest of the video's
                // life, so only the transient states earn a bar.
                //
                // The label stays, because it is the only thing left
                // saying what state the video ended in. Whisper
                // mishears clinical terminology, so "someone has read
                // the captions" is worth knowing without opening the
                // editor.
                //
                // `is_final` is the backend saying so, not this card
                // inferring it from the stage count: a stalled job is
                // on its last stage and is not finished, and a video
                // whose captions have not started is idle without being
                // done. Two states set it — captions signed off, and,
                // where no transcode job is configured, an upload that
                // plays as it is. The review timestamp is still read
                // here so an older backend, which sends no `is_final`,
                // keeps hiding the bar on a reviewed video.
                const done =
                  row.asset?.progress?.is_final === true ||
                  row.asset?.captions_reviewed_at != null;
                const progress = row.asset?.progress;

                return (
                  <Stack gap={4}>
                    {/* The name only, and the same name throughout: an
                        upload in flight shows the dropped file's name
                        rather than "Sending the file…", so the row does
                        not rename itself the moment the upload lands.
                        The fallback covers a caller that gives progress
                        without a name.

                        The size is deliberately absent. It answered a
                        question nobody asks here: it cannot be acted
                        on, it does not tell two videos apart the way
                        the name does, and it competed with the status
                        line beneath it. Size still appears where it
                        decides something — the message refusing a file
                        too large to upload. */}
                    <BodyTextInline>
                      {row.asset?.original_filename ??
                        uploadNames[row.key] ??
                        "Sending the file…"}
                    </BodyTextInline>

                    {percent !== undefined ? (
                      <>
                        {/* The bar creeps across the first of the four
                            stages as the bytes go up rather than
                            sitting at zero until the upload finishes:
                            a 900MB lecture holds this stage for
                            minutes, and a bar that does not move in
                            that time is indistinguishable from one
                            that has stopped. */}
                        <TeachingProgressBar
                          current={0}
                          total={4}
                          fill={Math.min(percent, 100) / 100}
                          showCount={false}
                        />
                        <BodyTextInline>Uploading</BodyTextInline>
                      </>
                    ) : progress && done ? (
                      /* Finished: the line alone, dimmed. Nothing is
                         happening and nothing is owed, so it reads as
                         settled rather than as something to attend
                         to. */
                      <BodyTextInline c="gray.6">
                        {progress.label}
                      </BodyTextInline>
                    ) : progress ? (
                      <>
                        {/* No "X of 4": the stages are our own
                            machinery, not something the admin is
                            working through, and the line underneath
                            says what is happening in words they can
                            act on. */}
                        <TeachingProgressBar
                          current={progress.stage}
                          total={progress.total_stages}
                          showCount={false}
                        />
                        <BodyTextInline
                          c={
                            progress.stalled ? "var(--alert-color)" : undefined
                          }
                        >
                          {progress.label}
                        </BodyTextInline>
                      </>
                    ) : null}
                  </Stack>
                );
              },
            },
            {
              header: "",
              render: (row) => {
                // One ellipsis rather than buttons in two columns,
                // matching the site and organisation tables. Editing
                // captions only appears where there are captions to
                // edit, so the menu never offers a dead action.
                if (!row.asset) return null;
                const asset = row.asset;
                return (
                  <EllipsisMenu
                    aria-label={`Actions for ${asset.original_filename}`}
                    items={[
                      ...(asset.has_captions
                        ? [
                            {
                              label: "Edit captions",
                              icon: <IconPencil />,
                              onClick: () => onEditCaptions?.(asset),
                            },
                          ]
                        : []),
                      {
                        label: "Delete",
                        icon: <IconTrash />,
                        color: "var(--alert-color)",
                        onClick: () => setPendingDelete(asset),
                      },
                    ]}
                  />
                );
              },
            },
          ]}
        />

        {media.unattached.length > 0 && (
          <BodyText>
            Uploads shown as “Not referenced” no longer match any video in this
            module’s content, usually because a reference was renamed or
            removed.
          </BodyText>
        )}
      </Stack>

      <ConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onAccept={async () => {
          if (pendingDelete) await onDelete?.(pendingDelete.asset_id);
        }}
        title="Delete this video?"
        acceptLabel="Delete"
        submittingLabel="Deleting…"
        icon={<IconAlertTriangle />}
      >
        {/* ConfirmModal wraps children in a <p>, so everything here
            must stay inline — a block element nested inside it is
            invalid HTML and React warns about it at runtime. */}
        <>
          {pendingDelete?.original_filename} will be removed permanently.
          {liveOrganisations.length > 0 && (
            <>
              {" "}
              This will make the module unavailable to learners in{" "}
              {liveOrganisations.join(", ")} until a replacement is uploaded.
            </>
          )}
        </>
      </ConfirmModal>
    </BaseCard>
  );
}
