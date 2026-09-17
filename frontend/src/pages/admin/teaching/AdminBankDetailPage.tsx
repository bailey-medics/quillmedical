/**
 * Admin Bank Detail Page
 *
 * Shows detail for a single question bank with an organisations table
 * showing live/closed status per org, and email template preview.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Group, Paper, Skeleton, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import ActiveStatusBadge from "@/components/badge/ActiveStatusBadge";
import DataTable from "@/components/tables/DataTable";
import { StateMessage } from "@/components/message-cards";
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
} from "@/components/teaching/module-media-card";
import { useModuleMedia } from "@/features/teaching/use-module-media";
import { api } from "@/lib/api";
import type {
  AdminBankDetail,
  BankOrganisation,
  MediaAsset,
} from "@/features/teaching/types";

export default function AdminBankDetailPage() {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const [bank, setBank] = useState<AdminBankDetail | null>(null);
  const [orgs, setOrgs] = useState<BankOrganisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Its own fetch rather than another leg of the page's Promise.all:
  // the media list is the one thing that changes while the admin is
  // here, so it refreshes after each upload without reloading the rest.
  const {
    media,
    loading: mediaLoading,
    error: mediaError,
    uploadProgress,
    upload,
    remove,
    loadCaptions,
    saveCaptions,
  } = useModuleMedia(bankId ?? null);

  // Which asset's captions are open, and the text once fetched. Held
  // here rather than in the card so the card stays presentational and
  // drivable from Storybook with no network.
  const [captionAsset, setCaptionAsset] = useState<MediaAsset | null>(null);
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
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Stack gap="lg">
        <Skeleton height={36} width={300} />
        <Skeleton height={100} />
        <Skeleton height={200} />
      </Stack>
    );
  }

  if (error || !bank) {
    return (
      <StateMessage
        icon={<IconAlertCircle />}
        title="Error loading data"
        description={error ?? "Bank not found"}
        colour="alert"
      />
    );
  }

  return (
    <Stack gap="lg">
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
        Only when the content references media. `references` comes from
        the MDX itself, so a module of pure text shows no card and there
        is no flag for an author to set — and therefore none to fall out
        of step with the slides.

        No route guard of its own: the whole /admin subtree sits under
        one <RequireCompetency competency="manage_users"> in main.tsx,
        and this page is inside it.
      */}
      {media?.references?.length ? (
        <ModuleMediaCard
          media={media}
          liveOrganisations={orgs
            .filter((o) => o.is_live)
            .map((o) => o.organisation_name)}
          uploadProgress={uploadProgress}
          onUpload={upload}
          onDelete={remove}
          onEditCaptions={openCaptions}
          loading={mediaLoading}
          error={mediaError}
        />
      ) : null}

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
    </Stack>
  );
}
