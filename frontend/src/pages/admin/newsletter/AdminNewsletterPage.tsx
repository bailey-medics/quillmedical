/**
 * Admin Newsletter Page
 *
 * The Newsletter section of the admin area: how many people a newsletter
 * would reach now, and where a mailing list is dropped in.
 *
 * Importing is two requests and never one. Dropping a file checks it,
 * which changes nothing, and shows what it would do; pressing import
 * sends the same file again with the fingerprint the check gave back,
 * so the file imported is the file that was checked. The file is held
 * here only until then, and nothing in it is ever shown.
 *
 * The route guard hides the page; the API refuses the data.
 */

import { useEffect, useState } from "react";
import { SimpleGrid, Stack } from "@mantine/core";
import { IconAlertCircle } from "@/components/icons/appIcons";
import { StateMessage } from "@/components/message-cards";
import {
  MailingListImport,
  type MailingListImportStage,
} from "@/components/newsletter";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stats-card/StatCard";
import {
  checkMailingList,
  fetchAudience,
  importMailingList,
  type MailingListSummary,
  type NewsletterAudience,
} from "@/lib/newsletter/api";

/** What to say when the backend gave no reason of its own. */
function reason(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function AdminNewsletterPage() {
  const [audience, setAudience] = useState<NewsletterAudience | null>(null);
  const [audienceFailed, setAudienceFailed] = useState(false);
  const [stage, setStage] = useState<MailingListImportStage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<MailingListSummary | undefined>();
  const [error, setError] = useState<string | undefined>();

  // Counts the imports, so the numbers are read again after each one.
  const [imports, setImports] = useState(0);

  useEffect(() => {
    async function loadAudience() {
      try {
        setAudience(await fetchAudience());
        setAudienceFailed(false);
      } catch {
        setAudienceFailed(true);
      }
    }

    void loadAudience();
  }, [imports]);

  async function check(dropped: File) {
    setError(undefined);
    setSummary(undefined);
    setFile(dropped);
    setStage("checking");
    try {
      setSummary(await checkMailingList(dropped));
      setStage("checked");
    } catch (caught) {
      setFile(null);
      setStage("idle");
      setError(reason(caught, "The file could not be checked."));
    }
  }

  async function runImport() {
    if (!file || !summary) return;
    setError(undefined);
    setStage("importing");
    try {
      setSummary(await importMailingList(file, summary.fingerprint));
      setFile(null);
      setStage("imported");
      setImports((count) => count + 1);
    } catch (caught) {
      // Nothing was added. The file is put aside, since the commonest
      // reason is that it changed after it was checked.
      setFile(null);
      setSummary(undefined);
      setStage("idle");
      setError(reason(caught, "The file could not be imported."));
    }
  }

  function startAgain() {
    setFile(null);
    setSummary(undefined);
    setError(undefined);
    setStage("idle");
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Newsletter" />

      {audienceFailed ? (
        <StateMessage
          icon={<IconAlertCircle />}
          title="The numbers could not be loaded"
          description="A mailing list can still be imported below."
          colour="alert"
        />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <StatCard
            title="Account holders who get news"
            value={audience?.accounts ?? 0}
            loading={audience === null}
          />
          <StatCard
            title="Mailing list subscribers"
            value={audience?.subscribers ?? 0}
            loading={audience === null}
          />
          <StatCard
            title="Unsubscribed from the mailing list"
            value={audience?.unsubscribed ?? 0}
            loading={audience === null}
          />
        </SimpleGrid>
      )}

      <MailingListImport
        stage={stage}
        summary={summary}
        fileName={file?.name}
        error={error}
        onFile={(dropped) => void check(dropped)}
        onReject={() =>
          setError(
            "That file is not a CSV. In Excel, use Save As and choose CSV UTF-8.",
          )
        }
        onImport={() => void runImport()}
        onStartAgain={startAgain}
      />
    </Stack>
  );
}
