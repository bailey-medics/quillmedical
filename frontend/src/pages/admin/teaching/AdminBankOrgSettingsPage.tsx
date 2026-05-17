/**
 * Admin Bank Organisation Settings Page
 *
 * Per-organisation settings for a question bank: live/closed toggle
 * and coordinator email (when the bank requires it).
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Container, Group, Skeleton, Stack } from "@mantine/core";
import { Controller } from "react-hook-form";
import { IconAlertCircle, IconArrowLeft } from "@/components/icons/appIcons";
import PageHeader from "@/components/page-header";
import IconButton from "@/components/button/IconButton";
import BaseCard from "@/components/base-card/BaseCard";
import SolidSwitch from "@/components/form/SolidSwitch";
import TextField from "@/components/form/TextField";
import ActiveStatusBadge from "@/components/badge/ActiveStatusBadge";
import { StateMessage } from "@/components/message-cards";
import { Heading } from "@/components/typography";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import { api } from "@/lib/api";
import type {
  AdminBankDetail,
  BankOrganisation,
} from "@/features/teaching/types";

interface BankOrgSettingsFormValues {
  isLive: boolean;
  coordinatorEmail: string;
}

interface SettingsFieldsProps {
  bank: AdminBankDetail;
}

function SettingsFields({ bank }: SettingsFieldsProps) {
  const navigate = useNavigate();
  const { bankId } = useParams<{ bankId: string }>();
  const { methods } = useFormContext();
  const isLive = methods.watch("isLive");

  return (
    <BaseCard>
      <Stack gap="md">
        <Group justify="space-between">
          <Heading>Exam status</Heading>
          <ActiveStatusBadge active={isLive} />
        </Group>
        <Controller
          name="isLive"
          control={methods.control}
          render={({ field }) => (
            <SolidSwitch
              label="Open for assessments"
              checked={field.value}
              onChange={(e) => field.onChange(e.currentTarget.checked)}
            />
          )}
        />

        {bank.email_coordinator_on_pass && (
          <>
            <Heading>Coordinator email</Heading>
            <TextField
              label="Email address"
              description="Receives certificate copies when students pass"
              placeholder="coordinator@example.com"
              type="email"
              {...methods.register("coordinatorEmail")}
              error={
                methods.formState.errors.coordinatorEmail?.message as string
              }
            />
          </>
        )}

        <FormStatus />
        <SubmitButton
          onCancel={() => navigate(`/admin/teaching/modules/${bankId}`)}
        />
      </Stack>
    </BaseCard>
  );
}

export default function AdminBankOrgSettingsPage() {
  const { bankId, orgId } = useParams<{ bankId: string; orgId: string }>();
  const navigate = useNavigate();

  const [bank, setBank] = useState<AdminBankDetail | null>(null);
  const [org, setOrg] = useState<BankOrganisation | null>(null);
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

      const thisOrg = orgsData.find((o) => o.organisation_id === Number(orgId));
      if (!thisOrg) {
        setError("Organisation not found");
        return;
      }
      setOrg(thisOrg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [bankId, orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSubmit(
    data: BankOrgSettingsFormValues,
  ): Promise<FormSubmitResult> {
    try {
      await api.put(
        `/teaching/admin/banks/${bankId}/organisations/${orgId}/settings`,
        {
          is_live: data.isLive,
          coordinator_email: data.coordinatorEmail || null,
        },
      );
      return {
        state: "success",
        message: { title: "Saved", description: "Settings updated" },
      };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Error saving settings",
          description:
            err instanceof Error ? err.message : "Failed to save settings",
        },
      };
    }
  }

  if (loading) {
    return (
      <Container size="lg">
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
      <Container size="lg">
        <StateMessage
          icon={<IconAlertCircle />}
          title="Error loading data"
          description={error ?? "Not found"}
          colour="alert"
        />
      </Container>
    );
  }

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group gap="sm">
          <IconButton
            icon={<IconArrowLeft />}
            variant="subtle"
            onClick={() => navigate(`/admin/teaching/modules/${bankId}`)}
            aria-label="Back to bank detail"
          />
          <PageHeader title={`${org.organisation_name} – ${bank.title}`} />
        </Group>

        <Form<BankOrgSettingsFormValues>
          defaultValues={{
            isLive: org.is_live,
            coordinatorEmail: org.coordinator_email ?? "",
          }}
          onSubmit={handleSubmit}
          submitLabel="Save"
          submittingLabel="Saving…"
          disableWhenClean
        >
          <SettingsFields bank={bank} />
        </Form>
      </Stack>
    </Container>
  );
}
