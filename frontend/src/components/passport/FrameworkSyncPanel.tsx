/**
 * Framework Sync Panel
 *
 * The passport admin page: one button that starts the framework sync job,
 * and how its last run ended. For a Quill operator, when a framework
 * repository merged and the framework pipeline's own start of the sync
 * failed. One run catches up on every version missing, so there is
 * nothing to choose: no list of frameworks and no settings.
 *
 * Shaped like the teaching modules page's "Sync all", with the button in
 * the page header. Pure: the page fetches and starts, and hands this the
 * state, so each state has a story of its own.
 */

import { Skeleton, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import IconTextButton from "@/components/button/IconTextButton";
import ResultMessage from "@/components/message-cards/ResultMessage";
import PageHeader from "@/components/page-header";
import { BodyText, Heading } from "@/components/typography";
import type { FrameworkSyncRun, FrameworkSyncStatus } from "@lib/passport";

export interface FrameworkSyncPanelProps {
  /** Whether the sync is set up here, and its last run. Null until loaded. */
  status: FrameworkSyncStatus | null;
  /** The status is still loading. */
  loading?: boolean;
  /** A start has been asked for and has not answered yet. */
  starting?: boolean;
  /** The job was started by this page and has not reported back yet. */
  started?: boolean;
  /** Why the last start was refused, in the server's words. */
  refusal?: string | null;
  /** Called when "Sync frameworks" is pressed. */
  onSync: () => void;
}

/** A moment, in British English: "4 Nov 2026, 16:00". */
function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** What one run did, in a sentence. */
function outcome(run: FrameworkSyncRun): string {
  if (run.status === "failed") return "It failed, and nothing was stored.";
  if (run.versions_written === 0) return "Every framework was up to date.";
  if (run.versions_written === 1) return "It stored 1 new framework version.";

  return `It stored ${run.versions_written} new framework versions.`;
}

function LastRun({ run }: { run: FrameworkSyncRun | null }) {
  if (run === null) {
    return <BodyText>The frameworks have not been synced yet.</BodyText>;
  }

  return (
    <Stack gap="xs">
      <BodyText>Started {when(run.started_at)}.</BodyText>
      {run.finished_at !== null && (
        <BodyText>Finished {when(run.finished_at)}.</BodyText>
      )}
      <BodyText>{outcome(run)}</BodyText>
      {run.error !== null && <BodyText>{run.error}</BodyText>}
    </Stack>
  );
}

export default function FrameworkSyncPanel({
  status,
  loading = false,
  starting = false,
  started = false,
  refusal = null,
  onSync,
}: FrameworkSyncPanelProps) {
  return (
    <Stack gap="lg">
      <PageHeader
        title="Passport"
        subtitle="Sync the frameworks from their repositories"
        action={
          <IconTextButton
            icon="refresh"
            label="Sync frameworks"
            onClick={onSync}
            loading={starting}
            disabled={starting}
          />
        }
      />

      {refusal !== null && <ResultMessage variant="warning" title={refusal} />}

      {started && (
        <ResultMessage
          variant="success"
          title="The framework sync has started"
          subtitle="It takes up to ten minutes. How it went appears below once it finishes."
        />
      )}

      <BaseCard>
        <Stack gap="sm">
          <Heading>Last sync</Heading>
          {loading || status === null ? (
            <Skeleton height={60} />
          ) : (
            <LastRun run={status.last_run} />
          )}
        </Stack>
      </BaseCard>
    </Stack>
  );
}
