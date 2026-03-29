/**
 * Admin Bank Detail Page
 *
 * Shows detail for a single question bank with live/closed toggle
 * and email template preview.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Container,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import PageHeader from "@/components/page-header";
import IconButton from "@/components/button/IconButton";
import { BodyText, BodyTextBold } from "@/components/typography";
import { api } from "@/lib/api";
import type { AdminBankDetail } from "@/features/teaching/types";

export default function AdminBankDetailPage() {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const [bank, setBank] = useState<AdminBankDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const fetchBank = useCallback(async () => {
    try {
      setError(null);
      const data = await api.get<AdminBankDetail>(
        `/teaching/admin/banks/${bankId}`,
      );
      setBank(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load bank detail",
      );
    } finally {
      setLoading(false);
    }
  }, [bankId]);

  useEffect(() => {
    fetchBank();
  }, [fetchBank]);

  const handleToggleLive = async (checked: boolean) => {
    setToggling(true);
    setToggleError(null);
    try {
      await api.put(`/teaching/admin/banks/${bankId}/status`, {
        is_live: checked,
      });
      setBank((prev) => (prev ? { ...prev, is_live: checked } : prev));
    } catch (err) {
      setToggleError(
        err instanceof Error ? err.message : "Failed to update status",
      );
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Loader />
      </Container>
    );
  }

  if (error || !bank) {
    return (
      <Container size="lg" py="xl">
        <Alert color="red" title="Error">
          {error ?? "Bank not found"}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <Group gap="sm">
          <IconButton
            icon={<IconArrowLeft />}
            variant="subtle"
            onClick={() => navigate("/admin/teaching")}
            aria-label="Back to teaching modules"
          />
          <PageHeader title={bank.title} />
        </Group>

        {/* Bank info */}
        <Paper p="md" withBorder>
          <Stack gap="xs">
            <Group>
              <BodyTextBold>Type:</BodyTextBold>
              <BodyText>{bank.type}</BodyText>
            </Group>
            <Group>
              <BodyTextBold>Version:</BodyTextBold>
              <BodyText>{bank.version}</BodyText>
            </Group>
            <Group>
              <BodyTextBold>Items:</BodyTextBold>
              <BodyText>{bank.item_count}</BodyText>
            </Group>
          </Stack>
        </Paper>

        {/* Exam status */}
        <Paper p="md" withBorder>
          <Stack gap="sm">
            <Group justify="space-between">
              <BodyTextBold>Exam status</BodyTextBold>
              <Badge color={bank.is_live ? "green" : "gray"}>
                {bank.is_live ? "Live" : "Closed"}
              </Badge>
            </Group>
            <Switch
              label="Open for assessments"
              checked={bank.is_live}
              onChange={(e) => handleToggleLive(e.currentTarget.checked)}
              disabled={toggling}
            />
            {toggleError && (
              <Alert color="red" title="Error">
                {toggleError}
              </Alert>
            )}
            {bank.email_on_pass && !bank.is_live && (
              <Alert color="yellow" title="Email on pass enabled">
                This bank sends certificates by email. Ensure a coordinator
                email is set in{" "}
                <a href="/admin/teaching/settings">teaching settings</a> before
                going live.
              </Alert>
            )}
          </Stack>
        </Paper>

        {/* Email templates preview */}
        {bank.email_on_pass && (
          <Paper p="md" withBorder>
            <Stack gap="sm">
              <BodyTextBold>Email templates</BodyTextBold>

              {bank.student_email_template ? (
                <Paper p="sm" bg="gray.0" withBorder>
                  <Stack gap="xs">
                    <BodyTextBold>Student email</BodyTextBold>
                    <Group>
                      <BodyTextBold>Subject:</BodyTextBold>
                      <BodyText>{bank.student_email_template.subject}</BodyText>
                    </Group>
                    <BodyText>{bank.student_email_template.body}</BodyText>
                  </Stack>
                </Paper>
              ) : (
                <BodyText>No student email template configured.</BodyText>
              )}

              {bank.coordinator_email_template ? (
                <Paper p="sm" bg="gray.0" withBorder>
                  <Stack gap="xs">
                    <BodyTextBold>Coordinator email</BodyTextBold>
                    <Group>
                      <BodyTextBold>Subject:</BodyTextBold>
                      <BodyText>
                        {bank.coordinator_email_template.subject}
                      </BodyText>
                    </Group>
                    <BodyText>{bank.coordinator_email_template.body}</BodyText>
                  </Stack>
                </Paper>
              ) : (
                <BodyText>No coordinator email template configured.</BodyText>
              )}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
