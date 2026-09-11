/**
 * LearningDashboard Page
 *
 * Lists all learning modules with progress overlay.
 * Mounted at /teaching/learn.
 * Phase 1: Static content via learning-data. Phase 2: API calls.
 */

import { SimpleGrid, Stack, Center, Skeleton } from "@mantine/core";
import { useEffect, useState } from "react";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import PageHeader from "@components/typography/PageHeader";
import ActionCard from "@/components/action-card/ActionCard";
import { BodyText } from "@/components/typography";
import { IconAlertCircle, IconBook } from "@/components/icons/appIcons";
import { StateMessage } from "@/components/message-cards";
import type {
  LearningModule,
  LearnerProgress,
} from "@/features/teaching/types";
import { getModules } from "@/features/teaching/learning-data";

/** Stub progress for Phase 1 — Phase 2 will fetch from API */
const STUB_PROGRESS: LearnerProgress[] = [
  {
    module_id: "colonoscopy-optical-diagnosis-test",
    last_slide_index: 3,
    last_video_position_seconds: null,
    completed_at: null,
  },
];

function getSubtitle(
  mod: LearningModule,
  progress: LearnerProgress | undefined,
): string {
  if (progress?.completed_at) {
    return `Completed · ${mod.slide_count} slides`;
  }
  if (progress) {
    return `In progress · Slide ${progress.last_slide_index + 1}/${mod.slide_count}`;
  }
  return `${mod.slide_count} slides`;
}

function getButtonLabel(progress: LearnerProgress | undefined): string {
  if (progress?.completed_at) return "Review";
  if (progress) return "Resume";
  return "Start";
}

export default function LearningDashboard() {
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Phase 1: stub progress. Phase 2 will fetch from API
  const progress = STUB_PROGRESS;

  useEffect(() => {
    async function load() {
      try {
        setModules(await getModules());
      } catch (err) {
        // api.get throws, and without this the page sat on skeletons
        // for ever with an unhandled rejection in the console — which
        // to a learner is indistinguishable from a slow network.
        setError(err instanceof Error ? err.message : "Failed to load modules");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <TeachingLayout>
        <Stack gap="lg">
          <Skeleton height={36} width={200} />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Skeleton height={160} />
            <Skeleton height={160} />
          </SimpleGrid>
        </Stack>
      </TeachingLayout>
    );
  }

  if (error) {
    return (
      <TeachingLayout>
        <StateMessage
          icon={<IconAlertCircle />}
          title="Error loading modules"
          description={error}
          colour="alert"
        />
      </TeachingLayout>
    );
  }

  return (
    <TeachingLayout>
      <Stack gap="lg">
        <PageHeader title="Learning materials" />

        {modules.length === 0 ? (
          <Center p="xl">
            <BodyText>No learning modules available</BodyText>
          </Center>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {modules.map((mod) => {
              const prog = progress.find((p) => p.module_id === mod.module_id);
              return (
                <ActionCard
                  key={mod.module_id}
                  icon={<IconBook />}
                  title={mod.title}
                  subtitle={getSubtitle(mod, prog)}
                  buttonLabel={getButtonLabel(prog)}
                  buttonUrl={`/teaching/learn/${mod.module_id}/slide/0`}
                />
              );
            })}
          </SimpleGrid>
        )}
      </Stack>
    </TeachingLayout>
  );
}
