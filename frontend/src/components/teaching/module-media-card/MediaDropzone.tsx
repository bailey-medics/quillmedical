/**
 * MediaDropzone
 *
 * The upload target for one file. Drag it on, or click to browse.
 *
 * **The accepted types are checked here, before a byte leaves the
 * browser.** Whatever accepts the upload checks them again — the
 * teaching backend against its own allow-list when it mints a URL, the
 * passport against `ALLOWED_EVIDENCE_TYPES` when it stores a blob — and
 * finding out after a 900 MB lecture that the file was the wrong type is
 * a poor way to learn it. Two checks rather than one because a caller
 * controls this one.
 *
 * **Video is the default rather than the only option.** It was written
 * for lectures and generalised when the passport needed a target for
 * scanned certificates; both want the same box with a different
 * allow-list, and a second near-identical component would drift.
 */

import { Dropzone } from "@mantine/dropzone";
import { Group } from "@mantine/core";
import Icon from "@/components/icons/Icon";
import { IconUpload } from "@/components/icons/appIcons";
import { BodyTextInline } from "@/components/typography";
import { ACCEPTED_VIDEO_TYPES } from "./mediaFormat";
import classes from "./MediaDropzone.module.css";

export interface MediaDropzoneProps {
  /** Called with the first accepted file. */
  onDrop: (file: File) => void;
  /** Disables the control while another upload is in flight. */
  disabled?: boolean;
  /** MIME types to accept. Defaults to the teaching video types. */
  accept?: string[];
  /** What the box says. Defaults to the video wording. */
  label?: string;
}

export default function MediaDropzone({
  onDrop,
  disabled = false,
  accept = ACCEPTED_VIDEO_TYPES,
  label = "Drop a video or click to browse",
}: MediaDropzoneProps) {
  return (
    <Dropzone
      onDrop={(files) => {
        if (files[0]) onDrop(files[0]);
      }}
      accept={accept}
      disabled={disabled}
      multiple={false}
      px="sm"
      py={4}
      className={classes.dropzone}
    >
      <Group gap="xs" justify="center" wrap="nowrap">
        <Icon icon={<IconUpload />} />
        <BodyTextInline>{label}</BodyTextInline>
      </Group>
    </Dropzone>
  );
}
