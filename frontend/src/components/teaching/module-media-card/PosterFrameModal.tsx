/**
 * PosterFrameModal
 *
 * Choose the moment of a video its poster is taken from, by typing the
 * time. The poster is the still a learner sees before pressing play.
 *
 * A time rather than a frame picked in a player here: the admin watches
 * the video in the slides, where learners see it, pauses where they
 * want the poster, and types the time the player shows. That keeps a
 * second video player out of the admin pages.
 *
 * Presentational. Saving is handed upward, so the modal can be driven
 * from Storybook with no network at all.
 */

import { useState } from "react";
import { Modal, Stack } from "@mantine/core";
import ButtonPair from "@/components/button/ButtonPair";
import TextField from "@/components/form/TextField";
import { BodyText, Heading } from "@/components/typography";
import { StateMessage } from "@/components/message-cards";
import { IconAlertTriangle } from "@/components/icons/appIcons";
import {
  DEFAULT_POSTER_SECONDS,
  formatPosterTime,
  parsePosterTime,
} from "./posterTime";

export interface PosterFrameModalProps {
  /** Controls modal visibility. */
  opened: boolean;
  /** Called on Cancel or Escape. */
  onClose: () => void;
  /** The file this is for, shown so the admin knows which. */
  filename?: string;
  /**
   * The second the poster is taken from now, where one was chosen.
   *
   * Null means nobody has chosen, and the job's default is in use.
   */
  currentSeconds?: number | null;
  /** Called with the chosen second. Returns true when it saved. */
  onSave: (seconds: number) => Promise<boolean>;
  /** What went wrong saving, shown rather than swallowed. */
  error?: string | null;
}

export default function PosterFrameModal({
  opened,
  onClose,
  filename,
  currentSeconds = null,
  onSave,
  error = null,
}: PosterFrameModalProps) {
  // What the admin has typed, or null while they have typed nothing, so
  // the box falls back to the current time without copying props into
  // state.
  const [typed, setTyped] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false);

  const current = currentSeconds ?? DEFAULT_POSTER_SECONDS;
  const text = typed ?? formatPosterTime(current);
  const seconds = parsePosterTime(text);

  const close = () => {
    setTyped(null);
    setChecked(false);
    onClose();
  };

  const handleSave = async () => {
    setChecked(true);

    if (seconds === null) return;

    setSaving(true);
    try {
      if (await onSave(seconds)) close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={close} title="Choose poster frame">
      <Stack gap="md">
        {filename && <Heading>{filename}</Heading>}

        {error && (
          <StateMessage
            icon={<IconAlertTriangle />}
            colour="alert"
            title="Something went wrong"
            description={error}
          />
        )}

        <BodyText>
          The poster is the still learners see before they press play. Watch the
          video in the slides, pause where you want the poster, and enter the
          time the player shows.
        </BodyText>

        <TextField
          label="Time in the video"
          description={
            currentSeconds === null
              ? `Such as 42 or 1:25. Now ${formatPosterTime(current)}, the default.`
              : `Such as 42 or 1:25. Now ${formatPosterTime(current)}.`
          }
          value={text}
          onChange={(event) => setTyped(event.currentTarget.value)}
          inputMode="numeric"
          error={
            checked && seconds === null
              ? "Enter a time such as 42 or 1:25"
              : undefined
          }
        />

        <BodyText>
          The new poster takes a minute or two to appear. Learners keep the old
          one until then.
        </BodyText>

        <ButtonPair
          acceptLabel="Save poster frame"
          onAccept={handleSave}
          onCancel={close}
          acceptLoading={saving}
          acceptDisabled={saving}
        />
      </Stack>
    </Modal>
  );
}
