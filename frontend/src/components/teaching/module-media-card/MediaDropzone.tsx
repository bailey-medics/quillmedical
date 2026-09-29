/**
 * MediaDropzone
 *
 * The upload target for one file. Drag it on, or click to browse.
 *
 * **The accepted types are checked here, before a byte leaves the
 * browser.** Whatever accepts the upload checks them again – the
 * teaching backend against its own allow-list when it mints a URL, the
 * passport against `ALLOWED_EVIDENCE_TYPES` when it stores a blob – and
 * finding out after a 900 MB lecture that the file was the wrong type is
 * a poor way to learn it. Two checks rather than one because a caller
 * controls this one.
 *
 * **There is no default: every caller names the types it allows.** It
 * was written for lectures and generalised when the passport needed a
 * target for scanned certificates. A default of video made the allow-list
 * something a new caller could forget to set and still get a working
 * box, accepting whatever the default happened to be. Requiring it makes
 * that a type error instead. The label is required for the same reason:
 * a default would describe files the caller has not allowed.
 */

import { Dropzone } from "@mantine/dropzone";
import { Group } from "@mantine/core";
import Icon from "@/components/icons/Icon";
import { IconUpload } from "@/components/icons/appIcons";
import { BodyTextInline } from "@/components/typography";
import classes from "./MediaDropzone.module.css";

export interface MediaDropzoneProps {
  /** Called with the first accepted file. */
  onDrop: (file: File) => void;
  /**
   * Called when a file is refused, most often for its type. Without it
   * a refused file vanishes and the box looks as if it did nothing.
   */
  onReject?: () => void;
  /** Disables the control while another upload is in flight. */
  disabled?: boolean;
  /** MIME types to accept. Required: nothing is allowed by default. */
  accept: string[];
  /** What the box says, naming the kind of file it takes. */
  label: string;
}

export default function MediaDropzone({
  onDrop,
  onReject,
  disabled = false,
  accept,
  label,
}: MediaDropzoneProps) {
  return (
    <Dropzone
      onDrop={(files) => {
        if (files[0]) onDrop(files[0]);
      }}
      onReject={() => onReject?.()}
      accept={accept}
      disabled={disabled}
      multiple={false}
      px="sm"
      // No vertical padding: the height is set in the stylesheet to
      // match an md button, with the label centred within it.
      className={classes.dropzone}
    >
      <Group gap="xs" justify="center" wrap="nowrap">
        {/* One size at every width: the box itself does not shrink on a
            phone, so a shrinking icon read as the box changing. */}
        <Icon icon={<IconUpload />} fixed className={classes.icon} />
        <BodyTextInline>{label}</BodyTextInline>
      </Group>
    </Dropzone>
  );
}
