/**
 * MailingListImport Component
 *
 * Where somebody drops a spreadsheet of people to add to the mailing
 * list. It is two steps and never one: dropping a file only checks it,
 * and shows what importing it would do; a second press imports it. A
 * wrong file is seen for what it is before anything changes.
 *
 * The page owns the requests and passes the state in, so each state can
 * be shown on its own. Nothing from the file is ever shown here but
 * numbers: the backend sends back counts, and the numbers of rows it
 * could not read.
 */

import { Stack } from "@mantine/core";
import BaseCard from "@components/base-card/BaseCard";
import { ButtonPair } from "@components/button";
import { IconAlertCircle, IconAlertTriangle } from "@components/icons/appIcons";
import { ResultMessage, StateMessage } from "@components/message-cards";
import MediaDropzone from "@components/teaching/module-media-card/MediaDropzone";
import { BodyText, Heading } from "@components/typography";
import type { MailingListSummary } from "@lib/newsletter/api";

/** Where an import has got to. */
export type MailingListImportStage =
  "idle" | "checking" | "checked" | "importing" | "imported";

export interface MailingListImportProps {
  /** Where the import has got to */
  stage: MailingListImportStage;
  /** What the file would do, once checked, or did, once imported */
  summary?: MailingListSummary;
  /** The name of the file that was dropped */
  fileName?: string;
  /** Why the last check or import did not work */
  error?: string;
  /** Called with a file when one is dropped */
  onFile: (file: File) => void;
  /** Called when a refused file is dropped, most often not a CSV */
  onReject: () => void;
  /** Called to import the file that was checked */
  onImport: () => void;
  /** Called to put the file aside and start again */
  onStartAgain: () => void;
}

/** What a spreadsheet saved as CSV calls itself, by browser. */
const CSV_TYPES = ["text/csv", "application/vnd.ms-excel", "text/plain"];

/** "1 person", "3 people". */
function people(count: number): string {
  return count === 1 ? "1 person" : `${count} people`;
}

/** "row 4" or "rows 4, 9 and 12", with "and more" when some are left out. */
function rowList(rows: number[], total: number): string {
  const more = total > rows.length ? " and more" : "";
  if (rows.length === 1) return `row ${rows[0]}${more}`;
  const head = rows.slice(0, -1).join(", ");
  return `rows ${head} and ${rows[rows.length - 1]}${more}`;
}

/** Which rows were left out and why, as one sentence or two. */
function leftOutReasons(summary: MailingListSummary): string {
  const reasons: string[] = [];
  if (summary.no_address > 0) {
    reasons.push(
      `No usable email address: ${rowList(summary.no_address_rows, summary.no_address)}.`,
    );
  }
  if (summary.unreadable_answer > 0) {
    reasons.push(
      `Opt in or out could not be read: ${rowList(summary.unreadable_answer_rows, summary.unreadable_answer)}.`,
    );
  }
  return reasons.join(" ");
}

function Counts({ summary }: { summary: MailingListSummary }) {
  const leftOut = summary.no_address + summary.unreadable_answer;
  return (
    <Stack gap="xs">
      <BodyText>
        {summary.imported ? "Added" : "New to the mailing list"}:{" "}
        {people(summary.new)}.
      </BodyText>
      <BodyText>
        Already on it and left as they are: {people(summary.already_there)}.
      </BodyText>
      {summary.switched_off > 0 && (
        <BodyText>
          On it now, and unsubscribed by this file:{" "}
          {people(summary.switched_off)}.
        </BodyText>
      )}
      <BodyText>
        Opted in: {summary.opted_in}. Opted out: {summary.opted_out}.
      </BodyText>
      {summary.have_accounts > 0 && (
        <BodyText>
          {people(summary.have_accounts)} already{" "}
          {summary.have_accounts === 1 ? "has" : "have"} a Quill account, and{" "}
          {summary.have_accounts === 1 ? "is" : "are"} kept as that account and
          not on the mailing list.
        </BodyText>
      )}
      {summary.repeated > 0 && (
        <BodyText>
          {summary.repeated}{" "}
          {summary.repeated === 1 ? "row names" : "rows name"} an address an
          earlier row had. Each address is one person, and opted out wins.
        </BodyText>
      )}
      {leftOut > 0 && (
        <StateMessage
          icon={<IconAlertTriangle />}
          title={`${leftOut} ${leftOut === 1 ? "row was" : "rows were"} left out`}
          colour="warning"
          description={leftOutReasons(summary)}
        />
      )}
    </Stack>
  );
}

export default function MailingListImport({
  stage,
  summary,
  fileName,
  error,
  onFile,
  onReject,
  onImport,
  onStartAgain,
}: MailingListImportProps) {
  const busy = stage === "checking" || stage === "importing";
  const showsDropzone = stage === "idle" || stage === "checking";

  return (
    <BaseCard>
      <Stack>
        <Heading>Import a mailing list</Heading>
        <BodyText>
          Drop a CSV file with a column headed Email. A Name column and an Opt
          in column are read if they are there. Excel saves a spreadsheet as one
          with Save As, then CSV UTF-8.
        </BodyText>
        <BodyText>
          Dropping a file only checks it. Nothing is added until you press
          import, and the file itself is never kept.
        </BodyText>

        {error && (
          <StateMessage
            icon={<IconAlertCircle />}
            title="That did not work"
            description={error}
            colour="alert"
          />
        )}

        {showsDropzone && (
          <MediaDropzone
            onDrop={onFile}
            onReject={onReject}
            disabled={busy}
            accept={CSV_TYPES}
            label={
              stage === "checking" ? "Checking the file…" : "Drop a CSV file"
            }
          />
        )}

        {summary && (stage === "checked" || stage === "importing") && (
          <>
            <Heading>
              {fileName
                ? `What ${fileName} would do`
                : "What this file would do"}
            </Heading>
            {!summary.has_opt_column && (
              <StateMessage
                icon={<IconAlertTriangle />}
                title="This file has no opt in column"
                description="Everybody in it is taken as opted in. If some of them have unsubscribed, add an Opt in column saying yes or no for each."
                colour="warning"
              />
            )}
            <Counts summary={summary} />
            <ButtonPair
              acceptLabel={`Import ${people(summary.new)}`}
              cancelLabel="Choose another file"
              onAccept={onImport}
              onCancel={onStartAgain}
              acceptLoading={stage === "importing"}
            />
          </>
        )}

        {summary && stage === "imported" && (
          <>
            <ResultMessage variant="success" title="Mailing list imported" />
            <Counts summary={summary} />
            <ButtonPair
              acceptLabel="Import another file"
              onAccept={onStartAgain}
            />
          </>
        )}
      </Stack>
    </BaseCard>
  );
}
