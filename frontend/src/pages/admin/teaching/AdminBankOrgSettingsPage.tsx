/**
 * Admin Bank Organisation Settings Page
 *
 * Per-organisation settings for a question bank: live/closed toggle
 * and coordinator email (when the bank requires it).
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Container,
  Group,
  Skeleton,
  Stack,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import PageHeader from "@/components/page-header";
import IconButton from "@/components/button/IconButton";
import BaseCard from "@/components/base-card/BaseCard";
import SolidSwitch from "@/components/form/SolidSwitch";
import TextField from "@/components/form/TextField";
import ActiveStatusBadge from "@/components/badge/ActiveStatusBadge";
import { StateMessage } from "@/components/message-cards";
import { Heading } from "@/components/typography";
import { api } from "@/lib/api";
import type {
  AdminBankDetail,
  BankOrganisation,
} from "@/features/teaching/types";

export default function AdminBankOrgSettingsPage() {
  const { bankId, orgId } = useParams<{ bankId: string; orgId: string }>();
  const navigate = useNavigate();

  const [bank, setBank] = useState<AdminBankDetail | null>(null);
  const [org, setOrg] = useState<BankOrganisation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isLive, setIsLive] = useState(false);
  const [coordinatorEmail, setCoordinatorEmail] = useState("");
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [originalEmail, setOriginalEmail] = useState("");

  const isDirty = coordinatorEmail !== originalEmail;

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

      const thisOrg = orgsData.find((o) => o.organisation_id === Number(orgId));
      if (!thisOrg) {
        setError("Organisation not found");
        return;
      }
      setOrg(thisOrg);
      setIsLive(thisOrg.is_live);
      setCoordinatorEmail(thisOrg.coordinator_email ?? "");
      setOriginalEmail(thisOrg.coordinator_email ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [bankId, orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleLive = async (checked: boolean) => {
    setToggling(true);
    setToggleError(null);
    try {
      await api.put(
        `/teaching/admin/banks/${bankId}/organisations/${orgId}/status`,
        { is_live: checked },
      );
      setIsLive(checked);
    } catch (err) {
      setToggleError(
        err instanceof Error ? err.message : "Failed to update status",
      );
    } finally {
      setToggling(false);
    }
  };

  const handleSaveEmail = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.put(
        `/teaching/admin/banks/${bankId}/organisations/${orgId}/coordinator`,
        { coordinator_email: coordinatorEmail },
      );
      setOriginalEmail(coordinatorEmail);
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save coordinator email",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={36} width={300} />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </Stack>
      </Container>
    );
  }

  if (error || !bank || !org) {
    return (
      <Container size="lg" py="xl">
        <StateMessage type="error" message={error ?? "Not found"} />
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
            onClick={() => navigate(`/admin/teaching/${bankId}`)}
            aria-label="Back to bank detail"
          />
          <PageHeader title={`${org.organisation_name} – ${bank.title}`} />
        </Group>

        {/* Exam status */}
        <BaseCard>
          <Stack gap="sm">
            <Group justify="space-between">
              <Heading>Exam status</Heading>
              <ActiveStatusBadge active={isLive} size="lg" />
            </Group>
            <SolidSwitch
              label="Open for assessments"
              checked={isLive}
              onChange={(e) => handleToggleLive(e.currentTarget.checked)}
              disabled={toggling}
            />
            {toggleError && <StateMessage type="error" message={toggleError} />}
          </Stack>
        </BaseCard>

        {/* Coordinator email — only shown when bank config requires it */}
        {bank.email_coordinator_on_pass && (
          <BaseCard>
            <Stack gap="md">
              <Heading>Coordinator email</Heading>
              <TextField
                label="Email address"
                description="Receives certificate copies when students pass"
                placeholder="coordinator@example.com"
                type="email"
                value={coordinatorEmail}
                onChange={(e) => setCoordinatorEmail(e.currentTarget.value)}
              />

              {saveError && <StateMessage type="error" message={saveError} />}
              {saved && (
                <Alert color="green" title="Saved">
                  Coordinator email updated.
                </Alert>
              )}

              <Group justify="flex-end">
                <Button
                  onClick={handleSaveEmail}
                  loading={saving}
                  disabled={!isDirty}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          </BaseCard>
        )}
      </Stack>
    </Container>
  );
}
