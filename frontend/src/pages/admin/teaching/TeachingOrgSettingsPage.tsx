/**
 * Teaching Org Settings Page
 *
 * Admin page for managing organisation-level teaching settings:
 * coordinator email and institution name.
 */

import { useCallback, useEffect, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
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
import TextField from "@/components/form/TextField";
import DirtyFormNavigation from "@/components/warnings/DirtyFormNavigation";
import { api } from "@/lib/api";
import type {
  TeachingOrgSettings,
  TeachingOrgSettingsInput,
} from "@/features/teaching/types";

export default function TeachingOrgSettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [coordinatorEmail, setCoordinatorEmail] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [originalName, setOriginalName] = useState("");

  const isDirty =
    coordinatorEmail !== originalEmail || institutionName !== originalName;

  const blocker = useBlocker(isDirty);

  const fetchSettings = useCallback(async () => {
    try {
      setError(null);
      const data = await api.get<TeachingOrgSettings>("/teaching/settings");
      setCoordinatorEmail(data.coordinator_email);
      setInstitutionName(data.institution_name);
      setOriginalEmail(data.coordinator_email);
      setOriginalName(data.institution_name);
    } catch (err) {
      // 404 is fine — means no settings yet
      const status = (err as Error & { status?: number }).status;
      if (status === 404) {
        // Leave form empty for first-time setup
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to load settings",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const body: TeachingOrgSettingsInput = {
        coordinator_email: coordinatorEmail,
        institution_name: institutionName,
      };
      await api.put("/teaching/settings", body);
      setOriginalEmail(coordinatorEmail);
      setOriginalName(institutionName);
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save settings",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={36} width={250} />
          <Skeleton height={200} />
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Alert color="red" title="Error">
          {error}
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
          <PageHeader title="Teaching settings" />
        </Group>

        <BaseCard>
          <Stack gap="md">
            <TextField
              label="Coordinator email"
              description="Receives certificate copies when students pass"
              placeholder="coordinator@example.com"
              type="email"
              value={coordinatorEmail}
              onChange={(e) => setCoordinatorEmail(e.currentTarget.value)}
            />

            <TextField
              label="Institution name"
              description="Appears on certificates and emails"
              placeholder="e.g. Royal Devon University Healthcare"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.currentTarget.value)}
            />

            {saveError && (
              <Alert color="red" title="Error">
                {saveError}
              </Alert>
            )}
            {saved && (
              <Alert color="green" title="Saved">
                Settings updated successfully.
              </Alert>
            )}

            <Group>
              <Button onClick={handleSave} loading={saving} disabled={!isDirty}>
                Save
              </Button>
            </Group>
          </Stack>
        </BaseCard>

        <DirtyFormNavigation blocker={blocker} />
      </Stack>
    </Container>
  );
}
