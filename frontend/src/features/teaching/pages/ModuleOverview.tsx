/**
 * ModuleOverview Page
 *
 * Module metadata with start/resume CTA.
 * Mounted at /teaching/learn/:moduleId.
 * Phase 1: Uses stub data.
 */

import { Container, Group, Stack } from "@mantine/core";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "@components/typography/PageHeader";
import { BodyText } from "@/components/typography";
import PreviousNextButton from "@/components/button/PreviousNextButton";

/** Stub metadata for Phase 1 */
const STUB_MODULES: Record<
  string,
  { title: string; description: string; slideCount: number; lastSlide: number }
> = {
  "colorectal-polyps": {
    title: "Colorectal Polyps",
    description:
      "This module covers the morphology categories of superficial lesions, clinical implications of each, and how to communicate findings consistently using the Paris classification.",
    slideCount: 7,
    lastSlide: 3,
  },
  "barrett-oesophagus": {
    title: "Barrett's Oesophagus",
    description:
      "An introduction to Barrett's oesophagus: definition, surveillance protocols, and endoscopic assessment.",
    slideCount: 12,
    lastSlide: 0,
  },
};

export default function ModuleOverview() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();

  const mod = moduleId ? STUB_MODULES[moduleId] : undefined;

  if (!mod) {
    return (
      <TeachingLayout>
        <Container size="lg">
          <BodyText>Module not found</BodyText>
        </Container>
      </TeachingLayout>
    );
  }

  const hasProgress = mod.lastSlide > 0;
  const buttonLabel = hasProgress
    ? `Resume from slide ${mod.lastSlide + 1}`
    : "Start learning";

  const startSlide = hasProgress ? mod.lastSlide : 0;

  return (
    <TeachingLayout>
      <Container size="lg">
        <Stack gap="lg">
          <PageHeader title={mod.title} />
          <BodyText>{mod.description}</BodyText>
          <BodyText c="dimmed">
            {mod.slideCount} slides
            {hasProgress && ` · Last viewed slide ${mod.lastSlide + 1}`}
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
      </Container>
    </TeachingLayout>
  );
}
