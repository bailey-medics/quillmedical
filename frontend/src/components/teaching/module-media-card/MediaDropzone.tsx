/**
 * MediaDropzone
 *
 * The upload target for one video reference. Drag a file onto it, or
 * click to browse.
 *
 * A lecture is large, so the accepted types are checked here before a
 * byte leaves the browser: the backend mints an upload URL against the
 * same allow-list, and finding out after a 900 MB upload that the file
 * was the wrong type is a poor way to learn it.
 */

import { Dropzone } from "@mantine/dropzone";
import { Group } from "@mantine/core";
import Icon from "@/components/icons/Icon";
import { IconUpload } from "@/components/icons/appIcons";
import { BodyTextInline } from "@/components/typography";
import { ACCEPTED_VIDEO_TYPES } from "./mediaFormat";

export interface MediaDropzoneProps {
  /** Called with the first accepted file. */
  onDrop: (file: File) => void;
  /** Disables the control while another upload is in flight. */
  disabled?: boolean;
}

export default function MediaDropzone({
  onDrop,
  disabled = false,
}: MediaDropzoneProps) {
  return (
    <Dropzone
      onDrop={(files) => {
        if (files[0]) onDrop(files[0]);
      }}
      accept={ACCEPTED_VIDEO_TYPES}
      disabled={disabled}
      multiple={false}
      p="xs"
    >
      <Group gap="xs" justify="center">
        <Icon icon={<IconUpload />} />
        <BodyTextInline>Drop a video, or click to browse</BodyTextInline>
      </Group>
    </Dropzone>
  );
}
