/**
 * CaptionEditorModal
 *
 * The whole WebVTT file in one editable box, saved back as it stands.
 *
 * Deliberately not a cue-by-cue editor with video sync. That is the
 * nicer tool and a great deal more work; this makes captions
 * correctable now, and does not foreclose building the better one once
 * there is a real lecture to try it against.
 *
 * Why it exists at all: Whisper mishears clinical terminology —
 * "caecum" as "seek 'em", drug names mangled — and captions are a WCAG
 * 2.1 AA requirement, so a learner relying on them is given the wrong
 * word with nothing to signal it. Until this existed nothing in the
 * application could read or write the file after the job wrote it.
 *
 * A plain `Modal` rather than `ConfirmModal`: that one wraps its
 * children in a `<p>`, so a textarea inside it is invalid HTML and
 * React warns at runtime.
 *
 * Presentational. Loading and saving are handed upward, so the modal
 * can be driven from Storybook with no network at all.
 */

import { useState } from "react";
import { Modal, Stack, Textarea } from "@mantine/core";
import ButtonPair from "@/components/button/ButtonPair";
import { BodyText, Heading } from "@/components/typography";
import classes from "./CaptionEditorModal.module.css";
import { StateMessage } from "@/components/message-cards";
import { IconAlertTriangle } from "@/components/icons/appIcons";

export interface CaptionEditorModalProps {
  /** Controls modal visibility. */
  opened: boolean;
  /** Called on Cancel or Escape. */
  onClose: () => void;
  /** The file this editor is for, shown so the admin knows which. */
  filename?: string;
  /**
   * The WebVTT as loaded.
   *
   * Null means the caption job has not run — a different thing from an
   * empty file, and shown as such rather than as a blank box the admin
   * might save over nothing.
   */
  webvtt?: string | null;
  /** True while the file is being fetched. */
  loading?: boolean;
  /** Called with the edited text. Returns true when it saved. */
  onSave: (webvtt: string) => Promise<boolean>;
  /** What went wrong loading or saving, shown rather than swallowed. */
  error?: string | null;
}

export default function CaptionEditorModal({
  opened,
  onClose,
  filename,
  webvtt = null,
  loading = false,
  onSave,
  error = null,
}: CaptionEditorModalProps) {
  // What the admin has typed, or null while they have typed nothing.
  // Null rather than the loaded text, so the value below can fall back
  // to the prop: mirroring props into state in an effect is what
  // `react-hooks/set-state-in-effect` exists to prevent, and it would
  // also leave the box holding the previous asset's transcript for a
  // render — a quiet way to save one lecture's captions onto another.
  const [edited, setEdited] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const text = edited ?? webvtt ?? "";

  const handleSave = async () => {
    setSaving(true);
    try {
      if (await onSave(text)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} size="xl" title="Edit captions">
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

        {!loading && webvtt === null && (
          <StateMessage
            icon={<IconAlertTriangle />}
            colour="warning"
            title="No captions yet"
            description={
              "The caption job has not produced a transcript for this " +
              "video. You can write one here, starting with the line WEBVTT."
            }
          />
        )}

        <BodyText>
          Machine transcription mishears clinical terms. Correct the words, not
          the timings — each block begins with the time it appears.
        </BodyText>

        <Textarea
          value={text}
          onChange={(event) => setEdited(event.currentTarget.value)}
          minRows={16}
          maxRows={28}
          autosize
          disabled={loading}
          aria-label="WebVTT captions"
          placeholder={loading ? "Loading…" : "WEBVTT"}
          classNames={{ input: classes.editor }}
        />

        <ButtonPair
          acceptLabel="Save captions"
          onAccept={handleSave}
          onCancel={onClose}
          acceptLoading={saving}
          acceptDisabled={loading || saving}
        />
      </Stack>
    </Modal>
  );
}
