import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import PublicButton from "@/components/button/PublicButton";
import Icon from "@/components/icons/Icon";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { colours } from "@/styles/colours";
import { theme } from "@/theme";
import { Container, MantineProvider, Stack } from "@mantine/core";
import "../global-styles";
import { IconChalkboardTeacher } from "@tabler/icons-react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <div style={{ color: colours.amber }}>
              <Icon icon={<IconChalkboardTeacher />} size="xl" />
            </div>
            <PublicTitle title="Clinical teaching platform" c="white" />
            <PublicText size="lg">
              A structured MCQ-based learning platform for trainees across every
              specialty — built on the same clinical foundation as the EPR, not
              bolted on as an afterthought. Quill Teaching turns real clinical
              knowledge into structured, assessable content that trainees can
              work through at their own pace.
            </PublicText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Gastroenterology: a working example"
              c="white"
            />
            <PublicText size="lg">
              The gastroenterology question bank is live on the teaching
              platform today — a curated set of MCQs covering upper and lower
              GI, hepatology, and nutrition. Each question is mapped to
              curriculum competencies, so trainees know exactly which learning
              objectives they are working towards.
            </PublicText>
            <PublicText size="lg">
              Questions are written by practising clinicians and reviewed by
              specialty trainers. They reflect real clinical scenarios — the
              kind of reasoning you need at the bedside, not pattern-matching
              from a textbook.
            </PublicText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Built for every specialty" c="white" />
            <PublicText size="lg">
              Gastroenterology is just the beginning. The platform is designed
              to scale across specialties — each with its own question bank,
              mapped to the relevant curriculum. Whether you are preparing for
              MRCP Part 1, specialty exams, or simply reinforcing day-to-day
              clinical knowledge, the content is structured to meet you where
              you are.
            </PublicText>
            <PublicText size="lg">
              Detailed explanations accompany every answer — not just confirming
              the correct option, but explaining why the alternatives are wrong.
              Learning happens in the feedback, not just the question.
            </PublicText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Try it now" c="white" />
            <PublicText size="lg">
              The teaching platform is live and free to use. Sign up, pick a
              specialty, and start working through questions — no commitment, no
              paywall, just good clinical teaching.
            </PublicText>
            <PublicButton href="https://teaching.quill-medical.com">
              Go to Teaching
            </PublicButton>
          </Stack>
        </Container>
      </PublicLightBackground>
    </PublicLayout>
  </MantineProvider>,
);
