/**
 * ModuleOverview Page
 *
 * Module metadata with start/resume CTA.
 * Mounted at /teaching/learn/:moduleId.
 * Phase 1: Static content via learning-data. Phase 2: API calls.
 */

import { Group, Skeleton, Stack } from "@mantine/core";
import { useEffect, useState } from "react";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "@components/typography/PageHeader";
import { BodyText } from "@/components/typography";
import PreviousNextButton from "@/components/button/PreviousNextButton";
import { getModuleDetail } from "@/features/teaching/learning-data";
import type { ModuleContent } from "@/features/teaching/content";

export default function ModuleOverview() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const [content, setContent] = useState<ModuleContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!moduleId) {
      return;
    }
    getModuleDetail(moduleId)
      .then(setContent)
      .finally(() => setLoading(false));
  }, [moduleId]);

  if (loading) {
    return (
      <TeachingLayout>
        <Stack gap="lg">
          <Skeleton height={36} width={200} />
          <Skeleton height={60} />
          <Skeleton height={20} width={120} />
        </Stack>
      </TeachingLayout>
    );
  }

  if (!content) {
    return (
      <TeachingLayout>
        <BodyText>Module not found</BodyText>
      </TeachingLayout>
    );
  }

  // Phase 1: no progress tracking. Phase 2 will fetch from API
  const lastSlide = 0;
  const hasProgress = lastSlide > 0;
  const buttonLabel = hasProgress
    ? `Resume from slide ${lastSlide + 1}`
    : "Start learning";

  const startSlide = hasProgress ? lastSlide : 0;

  return (
    <TeachingLayout>
      <Stack gap="lg">
        <PageHeader title={content.module.title} />
        <BodyText>{content.description}</BodyText>
        <BodyText c="dimmed">
          {content.module.slide_count} slides
          {hasProgress && ` · Last viewed slide ${lastSlide + 1}`}
        </BodyText>
        <Group justify="flex-end">
          <PreviousNextButton
            onNext={() =>
              navigate(`/teaching/learn/${moduleId}/slide/${startSlide}`)
            }
            nextLabel={buttonLabel}
          />
        </Group>
      </Stack>
    </TeachingLayout>
  );
}
