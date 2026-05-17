/**
 * LearningDashboard Page
 *
 * Lists all learning modules with progress overlay.
 * Mounted at /teaching/learn.
 * Phase 1: Uses stub data (no backend).
 */

import { SimpleGrid, Stack, Center } from "@mantine/core";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import PageHeader from "@components/typography/PageHeader";
import ActionCard from "@/components/action-card/ActionCard";
import { BodyText } from "@/components/typography";
import { IconBook } from "@/components/icons/appIcons";
import type {
  LearningModule,
  LearnerProgress,
} from "@/features/teaching/types";

/** Stub modules for Phase 1 */
const STUB_MODULES: LearningModule[] = [
  {
    module_id: "colorectal-polyps",
    title: "Colorectal Polyps",
    order_index: 1,
    status: "live",
    slide_count: 7,
  },
  {
    module_id: "barrett-oesophagus",
    title: "Barrett's Oesophagus",
    order_index: 2,
    status: "live",
    slide_count: 12,
  },
];

/** Stub progress for Phase 1 */
const STUB_PROGRESS: LearnerProgress[] = [
  {
    module_id: "colorectal-polyps",
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
  // Phase 1: stub data. Phase 2 will fetch from API
  const modules = STUB_MODULES;
  const progress = STUB_PROGRESS;

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
                  buttonUrl={`/teaching/learn/${mod.module_id}`}
                />
              );
            })}
          </SimpleGrid>
        )}
      </Stack>
    </TeachingLayout>
  );
}
