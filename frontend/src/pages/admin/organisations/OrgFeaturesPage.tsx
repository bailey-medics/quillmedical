/**
 * Organisation Features Page
 *
 * Admin page to enable/disable features on an organisation.
 * Toggles edit local draft state. A Save button appears when there are
 * unsaved changes and opens a confirmation modal listing what will change.
 */

import { useEffect, useMemo, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Container,
  Stack,
  Paper,
  Text,
  Title,
  Skeleton,
  Alert,
  Group,
  List,
  Modal,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import PageHeader from "@/components/page-header";
import Icon from "@/components/icons";
import SolidSwitch from "@/components/form/SolidSwitch";
import DirtyFormNavigation from "@/components/warnings";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";

/** Known features that can be toggled on an organisation. */
const AVAILABLE_FEATURES: {
  key: string;
  label: string;
  description: string;
}[] = [
  {
    key: "teaching",
    label: "Teaching",
    description: "Assessments, question banks, and educator tools",
  },
  {
    key: "messaging",
    label: "Messaging",
    description: "Secure messaging between staff and patients",
  },
  {
    key: "letters",
    label: "Letters",
    description: "Clinical letter composition and management",
  },
];

interface FeatureOut {
  feature_key: string;
  enabled_at: string;
  enabled_by: number | null;
}

interface OrgSummary {
  id: number;
  name: string;
}

interface FeatureChange {
  key: string;
  label: string;
  enabled: boolean;
}

export default function OrgFeaturesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { reload } = useAuth();
  const [orgName, setOrgName] = useState<string>("");
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!id) {
        setError("No organisation ID provided");
        setLoading(false);
        return;
      }

      try {
        const [orgData, featuresData] = await Promise.all([
          api.get<OrgSummary>(`/organizations/${id}`),
          api.get<{ features: FeatureOut[] }>(`/organizations/${id}/features`),
        ]);
        setOrgName(orgData.name);
        const keys = new Set(featuresData.features.map((f) => f.feature_key));
        setSavedKeys(keys);
        setDraftKeys(new Set(keys));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id]);

  const pendingChanges = useMemo<FeatureChange[]>(() => {
    const changes: FeatureChange[] = [];
    for (const feature of AVAILABLE_FEATURES) {
      const wasSaved = savedKeys.has(feature.key);
      const isDraft = draftKeys.has(feature.key);
      if (wasSaved !== isDraft) {
        changes.push({
          key: feature.key,
          label: feature.label,
          enabled: isDraft,
        });
      }
    }
    return changes;
  }, [savedKeys, draftKeys]);

  const hasChanges = pendingChanges.length > 0;
  const hasDisables = pendingChanges.some((c) => !c.enabled);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasChanges && currentLocation.pathname !== nextLocation.pathname,
  );

  function toggleDraft(featureKey: string) {
    setDraftKeys((prev) => {
      const next = new Set(prev);
      if (next.has(featureKey)) {
        next.delete(featureKey);
      } else {
        next.add(featureKey);
      }
      return next;
    });
  }

  async function confirmSave() {
    if (!id) return;

    setConfirmOpen(false);
    setSaving(true);

    try {
      await Promise.all(
        pendingChanges.map((change) =>
          api.put(`/organizations/${id}/features/${change.key}`, {
            enabled: change.enabled,
          }),
        ),
      );
      setSavedKeys(new Set(draftKeys));
      await reload();
    } catch {
      // Revert draft to last saved state on failure
      setDraftKeys(new Set(savedKeys));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={60} />
          <Skeleton height={200} />
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Alert
          icon={<Icon icon={<IconAlertCircle />} size="lg" />}
          title="Error loading features"
          color="red"
        >
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Features" />

        <Paper shadow="sm" p="lg" radius="md" withBorder>
          <Stack gap="lg">
            <Title order={2} size="lg">
              Available features
            </Title>

            <Text size="lg">
              You are about to make organisation-wide changes. Please do so with
              care. You will need to press &ldquo;Save changes&rdquo; below for
              these changes to take effect.
            </Text>

            {AVAILABLE_FEATURES.map((feature) => (
              <Group key={feature.key} justify="space-between" wrap="nowrap">
                <Stack gap={2}>
                  <Text fw={500}>{feature.label}</Text>
                  <Text size="sm" c="dimmed">
                    {feature.description}
                  </Text>
                </Stack>

                <SolidSwitch
                  label={feature.label}
                  checked={draftKeys.has(feature.key)}
                  disabled={saving}
                  onChange={() => toggleDraft(feature.key)}
                  aria-label={`Toggle ${feature.label}`}
                />
              </Group>
            ))}
          </Stack>
        </Paper>

        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => navigate(`/admin/organisations/${id}`)}
          >
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!hasChanges}
            onClick={() => setConfirmOpen(true)}
          >
            Save changes
          </Button>
        </Group>

        <Modal
          opened={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Confirm feature changes"
          centered
        >
          <Stack gap="md">
            <Text>
              You are about to make the following changes for{" "}
              <Text span fw={700}>
                {orgName}
              </Text>
              :
            </Text>
            <List>
              {pendingChanges.map((change) => (
                <List.Item key={change.key}>
                  <Text span fw={500}>
                    {change.label}
                  </Text>
                  {" — "}
                  {change.enabled ? "enable" : "disable"}
                </List.Item>
              ))}
            </List>
            {hasDisables && (
              <Alert color="orange" variant="light">
                Disabling features will immediately remove access for all users
                in this organisation.
              </Alert>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfirmOpen(false)}>
                Go back
              </Button>
              <Button
                color={hasDisables ? "red" : "blue"}
                onClick={confirmSave}
              >
                Confirm
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>

      <DirtyFormNavigation
        blocker={blocker}
        onProceed={() => setDraftKeys(new Set(savedKeys))}
      />
    </Container>
  );
}
