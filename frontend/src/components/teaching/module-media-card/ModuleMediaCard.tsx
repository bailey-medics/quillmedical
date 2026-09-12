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
import { Progress, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal";
import DataTable from "@/components/tables/DataTable";
import { StateMessage } from "@/components/message-cards";
import IconTextButton from "@/components/button/IconTextButton";
import { IconAlertTriangle } from "@/components/icons/appIcons";
import { BodyText, BodyTextInline, Heading } from "@/components/typography";
import type { MediaAsset, ModuleMedia } from "@/features/teaching/types";
import MediaDropzone from "./MediaDropzone";
import { formatSize } from "./mediaFormat";

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
  /** Called with the file dropped against a reference key. */
  onUpload?: (key: string, file: File) => void;
  /** Called once the admin has confirmed removing an asset. */
  onDelete?: (assetId: string) => void | Promise<void>;
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
  onUpload,
  onDelete,
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
              header: "File",
              render: (row) =>
                row.asset ? (
                  <Stack gap={2}>
                    <BodyTextInline>
                      {row.asset.original_filename}
                    </BodyTextInline>
                    <BodyTextInline>
                      {formatSize(row.asset.size_bytes)}
                    </BodyTextInline>
                  </Stack>
                ) : uploadProgress[row.key] !== undefined ? (
                  <Progress
                    value={uploadProgress[row.key]}
                    aria-label={`Uploading ${row.key}`}
                  />
                ) : (
                  <MediaDropzone onDrop={(file) => onUpload?.(row.key, file)} />
                ),
            },
            {
              header: "",
              render: (row) =>
                row.asset ? (
                  <IconTextButton
                    icon="trash"
                    label="Delete"
                    variant="outline"
                    onClick={() => setPendingDelete(row.asset)}
                  />
                ) : null,
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
