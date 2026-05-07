/**
 * Admin Bank Detail Page
 *
 * Shows detail for a single question bank with an organisations table
 * showing live/closed status per org, and email template preview.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Container, Group, Paper, Skeleton, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import ActiveStatusBadge from "@/components/badge/ActiveStatusBadge";
import DataTable, { type Column } from "@/components/tables/DataTable";
import { StateMessage } from "@/components/message-cards";
import { IconAlertCircle } from "@/components/icons/appIcons";
import {
  BodyText,
  BodyTextInline,
  BodyTextBold,
  Heading,
} from "@/components/typography";
import MarkdownView from "@/components/typography/MarkdownView";
import { api } from "@/lib/api";
import type {
  AdminBankDetail,
  BankOrganisation,
} from "@/features/teaching/types";

export default function AdminBankDetailPage() {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const [bank, setBank] = useState<AdminBankDetail | null>(null);
  const [orgs, setOrgs] = useState<BankOrganisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
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
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={36} width={300} />
          <Skeleton height={100} />
          <Skeleton height={200} />
        </Stack>
      </Container>
    );
  }

  if (error || !bank) {
    return (
      <Container size="lg" py="xl">
        <StateMessage
          icon={<IconAlertCircle />}
          title="Error loading data"
          description={error ?? "Bank not found"}
          colour="alert"
        />
      </Container>
    );
  }

  return (
    <Container size="lg" pt="xl">
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
                    render: (org) => (
                      <ActiveStatusBadge active={org.is_live} size="md" />
                    ),
                  },
                  ...(bank.email_coordinator_on_pass
                    ? [
                        {
                          header: "Coordinator",
                          render: (org: BankOrganisation) =>
                            org.coordinator_email ?? "Not set",
                        } as Column<BankOrganisation>,
                      ]
                    : []),
                ]}
                onRowClick={(org) =>
                  navigate(
                    `/admin/teaching/${bankId}/org/${org.organisation_id}`,
                  )
                }
                getRowKey={(org) => org.organisation_id}
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
                        <BodyText>
                          {bank.student_email_template.subject}
                        </BodyText>
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
      </Stack>
    </Container>
  );
}
