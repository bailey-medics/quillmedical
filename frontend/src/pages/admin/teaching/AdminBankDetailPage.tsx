/**
 * Admin Bank Detail Page
 *
 * Shows detail for a single question bank with an organisations table
 * showing live/closed status per org, and email template preview.
 */

import { useCallback, useEffect, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { Group, Paper, Skeleton, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import ActiveStatusBadge from "@/components/badge/ActiveStatusBadge";
import DataTable from "@/components/tables/DataTable";
import { StateMessage } from "@/components/message-cards";
import DirtyFormNavigation from "@/components/warnings";
import { IconAlertCircle } from "@/components/icons/appIcons";
import {
  BodyText,
  BodyTextInline,
  BodyTextBold,
  Heading,
} from "@/components/typography";
import MarkdownView from "@/components/typography/MarkdownView";
import {
  CaptionEditorModal,
  ModuleMediaCard,
  PosterFrameModal,
} from "@/components/teaching/module-media-card";
import { useModuleMedia } from "@/features/teaching/use-module-media";
import { api } from "@/lib/api";
import { useWakeLockWhile } from "@lib/wake-lock/useWakeLockWhile";
import type {
  AdminBankDetail,
  BankOrganisation,
  MediaAsset,
} from "@/features/teaching/types";

interface OrganisationVideosProps {
  bankId: string;
  organisation: BankOrganisation;
  /** Told whenever an upload starts or ends, so the page can guard it. */
  onUploadingChange: (orgUnitId: number, uploading: boolean) => void;
}

/**
 * One organisation's videos of the module: the card, and the caption and
 * poster editors it opens.
 *
 * A video is stored once for each organisation running the module, so
 * the page holds one of these for each organisation the caller may
 * upload for, each with its own fetch. The media list is the one thing
 * that changes while the admin is here, so it refreshes after each
 * upload without reloading the rest of the page.
 */
function OrganisationVideos({
  bankId,
  organisation,
  onUploadingChange,
}: OrganisationVideosProps) {
  const orgUnitId = organisation.org_unit_id;
  const {
    media,
    loading: mediaLoading,
    error: mediaError,
    uploadProgress,
    uploadNames,
    uploading,
    uploadErrors,
    upload,
    remove,
    loadCaptions,
    saveCaptions,
    savePosterFrame,
  } = useModuleMedia(bankId, undefined, orgUnitId);

  // The page guards navigation for every section at once, so each says
  // when its own upload starts and ends, and stops counting on unmount.
  useEffect(() => {
    onUploadingChange(orgUnitId, uploading);
    return () => onUploadingChange(orgUnitId, false);
  }, [onUploadingChange, orgUnitId, uploading]);

  // Which asset's captions are open, and the text once fetched. Held
  // here rather than in the card so the card stays presentational and
  // drivable from Storybook with no network.
  const [captionAsset, setCaptionAsset] = useState<MediaAsset | null>(null);
  const [posterAsset, setPosterAsset] = useState<MediaAsset | null>(null);
  const [captionText, setCaptionText] = useState<string | null>(null);
  const [captionsLoading, setCaptionsLoading] = useState(false);

  const openCaptions = useCallback(
    async (asset: MediaAsset) => {
      // Opened first, so the modal appears with a spinner rather than
      // after a silent pause the admin reads as a dead button.
      setCaptionAsset(asset);
      setCaptionText(null);
      setCaptionsLoading(true);
      try {
        const loaded = await loadCaptions(asset.asset_id);
        setCaptionText(loaded?.webvtt ?? null);
      } finally {
        setCaptionsLoading(false);
      }
    },
    [loadCaptions],
  );

  // Only when the content references media. `references` comes from the
  // MDX itself, so a module of pure text shows no card and there is no
  // flag for an author to set - and therefore none to fall out of step
  // with the slides.
  if (!media?.references?.length) return null;

  return (
    <>
      <ModuleMediaCard
        media={media}
        organisation={organisation.organisation_name}
        liveOrganisations={
          organisation.is_live ? [organisation.organisation_name] : []
        }
        uploadProgress={uploadProgress}
        uploadNames={uploadNames}
        uploadErrors={uploadErrors}
        onUpload={upload}
        onDelete={remove}
        onEditCaptions={openCaptions}
        onChoosePoster={setPosterAsset}
        loading={mediaLoading}
        error={mediaError}
      />

      {/*
        Fetched when the editor opens rather than with the media list: a
        WebVTT is a whole lecture transcript, and loading one per row
        would cost several requests to render a card whose captions are
        usually not being looked at.
      */}
      <CaptionEditorModal
        opened={captionAsset !== null}
        onClose={() => setCaptionAsset(null)}
        filename={captionAsset?.original_filename}
        webvtt={captionText}
        loading={captionsLoading}
        onSave={(webvtt) =>
          captionAsset
            ? saveCaptions(captionAsset.asset_id, webvtt)
            : Promise.resolve(false)
        }
        error={mediaError}
      />

      <PosterFrameModal
        opened={posterAsset !== null}
        onClose={() => setPosterAsset(null)}
        filename={posterAsset?.original_filename}
        currentSeconds={posterAsset?.poster_at_seconds ?? null}
        onSave={(seconds) =>
          posterAsset
            ? savePosterFrame(posterAsset.asset_id, seconds)
            : Promise.resolve(false)
        }
        error={mediaError}
      />
    </>
  );
}

export default function AdminBankDetailPage() {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const [bank, setBank] = useState<AdminBankDetail | null>(null);
  const [orgs, setOrgs] = useState<BankOrganisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which organisations have a video still going up. One section each,
  // so the guard below asks whether any of them has.
  const [uploadingAt, setUploadingAt] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const uploading = uploadingAt.size > 0;

  const handleUploadingChange = useCallback(
    (orgUnitId: number, isUploading: boolean) => {
      setUploadingAt((current) => {
        if (current.has(orgUnitId) === isUploading) return current;
        const next = new Set(current);
        if (isUploading) next.add(orgUnitId);
        else next.delete(orgUnitId);
        return next;
      });
    },
    [],
  );

  // Leaving mid-upload loses the file, so both ways out are guarded.
  //
  // The two are not the same fault. A route change unmounts the page
  // but not the XMLHttpRequest, which lives in a closure - the bytes
  // keep going and the asset is recorded, so what is lost is only the
  // progress bar and anywhere to report a failure. A tab close or
  // reload kills the transfer itself, and the `link` call that records
  // the asset never runs, so the part-uploaded object sits in the
  // bucket with nothing pointing at it.
  //
  // The blocker covers the first and `beforeunload` the second. Both
  // read the same flag, because from the admin's side it is one
  // question: is a file still going up?
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      uploading && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!uploading) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      // preventDefault is the whole API - the browser shows its own
      // wording and ignores any message we set.
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [uploading]);

  // A computer that sleeps cuts the upload off, so the screen is kept
  // on while a file is going up. Best effort: the upload resumes after
  // a sleep anyway.
  useWakeLockWhile(uploading);

  const fetchData = useCallback(async () => {
    if (!bankId) {
      setError("No module ID provided");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [bankData, orgsData] = await Promise.all([
        api.get<AdminBankDetail>(`/teaching/admin/banks/${bankId}`),
        api.get<BankOrganisation[]>(
          `/teaching/admin/banks/${bankId}/organisations`,
        ),
      ]);
      setBank(bankData);
      setOrgs(orgsData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load bank detail",
      );
    } finally {
      setLoading(false);
    }
  }, [bankId]);

  useEffect(() => {
    // Every setState in `fetchData` runs after an await, so none of them
    // happens synchronously in this effect body and no cascading render
    // occurs. The rule cannot follow state updates across an async
    // boundary, so it flags the call itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  // Rendered in every branch below, not just the happy one. An upload
  // survives a refetch of the bank detail, so the page can be blocking
  // navigation while showing its skeleton or its error - and a blocked
  // navigation with no modal on screen leaves the router stuck with no
  // way to answer it.
  //
  // The wording stops short of promising the upload is cancelled,
  // because on a route change it is not: the request outlives the page
  // and usually finishes. What the admin actually loses is sight of
  // it, and that is what the modal says.
  const uploadGuard = (
    <DirtyFormNavigation
      blocker={blocker}
      message="A video is still uploading. If you leave this page you will not see whether it finishes."
      acceptLabel="Leave anyway"
    />
  );

  if (loading) {
    return (
      <Stack gap="lg">
        {uploadGuard}
        <Skeleton height={36} width={300} />
        <Skeleton height={100} />
        <Skeleton height={200} />
      </Stack>
    );
  }

  if (error || !bank) {
    return (
      <>
        {uploadGuard}
        <StateMessage
          icon={<IconAlertCircle />}
          title="Error loading data"
          description={error ?? "Bank not found"}
          colour="alert"
        />
      </>
    );
  }

  return (
    <Stack gap="lg">
      {uploadGuard}
      <PageHeader title={bank.title} />

      {/* Bank info */}
      <BaseCard>
        <Stack gap="xs">
          <Group>
            <BodyTextBold>Type:</BodyTextBold>
            <BodyTextInline>{bank.type}</BodyTextInline>
          </Group>
          <Group>
            <BodyTextBold>Version:</BodyTextBold>
            <BodyTextInline>{bank.version}</BodyTextInline>
          </Group>
          <Group>
            <BodyTextBold>Items:</BodyTextBold>
            <BodyTextInline>{bank.item_count}</BodyTextInline>
          </Group>
        </Stack>
      </BaseCard>

      {/* Organisations */}
      <BaseCard>
        <Stack gap="sm">
          <Heading>Organisations</Heading>
          {orgs.length === 0 ? (
            <BodyText>
              No organisations have the teaching feature enabled.
            </BodyText>
          ) : (
            <DataTable<BankOrganisation>
              data={orgs}
              columns={[
                {
                  header: "Organisation",
                  render: (org) => org.organisation_name,
                },
                {
                  header: "Status",
                  render: (org) => <ActiveStatusBadge active={org.is_live} />,
                },
              ]}
              onRowClick={(org) =>
                navigate(
                  `/admin/teaching/modules/${bankId}/org/${org.org_unit_id}`,
                )
              }
              getRowKey={(org) => org.org_unit_id}
              emptyMessage="No organisations have the teaching feature enabled"
            />
          )}
        </Stack>
      </BaseCard>

      {/* Email templates preview */}
      {(bank.email_student_on_pass || bank.email_coordinator_on_pass) && (
        <BaseCard>
          <Stack gap="sm">
            <Heading>Email templates</Heading>

            {bank.email_student_on_pass &&
              (bank.student_email_template ? (
                <Paper
                  p="sm"
                  bg="var(--card-bg, var(--mantine-color-gray-0))"
                  withBorder
                >
                  <Stack gap="xs">
                    <BodyTextBold>Student email</BodyTextBold>
                    <Group>
                      <BodyTextBold>Subject:</BodyTextBold>
                      <BodyText>{bank.student_email_template.subject}</BodyText>
                    </Group>
                    {bank.student_email_template.preheader && (
                      <Group>
                        <BodyTextBold>Inbox preview:</BodyTextBold>
                        <BodyText>
                          {bank.student_email_template.preheader}
                        </BodyText>
                      </Group>
                    )}
                    <MarkdownView source={bank.student_email_template.body} />
                  </Stack>
                </Paper>
              ) : (
                <BodyText>No student email template configured.</BodyText>
              ))}

            {bank.email_coordinator_on_pass &&
              (bank.coordinator_email_template ? (
                <Paper
                  p="sm"
                  bg="var(--card-bg, var(--mantine-color-gray-0))"
                  withBorder
                >
                  <Stack gap="xs">
                    <BodyTextBold>Coordinator email</BodyTextBold>
                    <Group>
                      <BodyTextBold>Subject:</BodyTextBold>
                      <BodyText>
                        {bank.coordinator_email_template.subject}
                      </BodyText>
                    </Group>
                    {bank.coordinator_email_template.preheader && (
                      <Group>
                        <BodyTextBold>Inbox preview:</BodyTextBold>
                        <BodyText>
                          {bank.coordinator_email_template.preheader}
                        </BodyText>
                      </Group>
                    )}
                    <MarkdownView
                      source={bank.coordinator_email_template.body}
                    />
                  </Stack>
                </Paper>
              ) : (
                <BodyText>No coordinator email template configured.</BodyText>
              ))}
          </Stack>
        </BaseCard>
      )}

      {/*
        One card for each organisation whose videos the caller may upload,
        which is every organisation holding the module. Each card shows
        only when the content references media.

        No route guard of its own: the module pages sit under
        <RequireOperator> in routes.tsx, so only a superadmin reaches this
        page. The API also lets a teaching admin manage their own
        organisation's videos, but not through here.
      */}
      {bankId
        ? orgs
            .filter((org) => org.may_upload_videos)
            .map((org) => (
              <OrganisationVideos
                key={org.org_unit_id}
                bankId={bankId}
                organisation={org}
                onUploadingChange={handleUploadingChange}
              />
            ))
        : null}
    </Stack>
  );
}
