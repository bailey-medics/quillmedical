import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import { PublicFeatureCard } from "@/components/feature-card/PublicFeatureCard";
import PublicFeatureCardGrid from "@/components/feature-card/PublicFeatureCardGrid";
import {
  IconArrowsShuffle,
  IconCertificate,
  IconChartBar,
  IconClock,
  IconLock,
  IconPhoto,
  IconShieldCheck,
  IconStack2,
} from "@/components/icons/appIcons";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Assessments you can *stand behind*" />
            <PublicBodyText justify="centre">
              An assessment is only worth its certificate if it is fair to every
              candidate, and if its result can be traced back to exactly what
              was asked. Quill is built for both.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Fair to every candidate" size="md" c="white" />
          </Stack>
          <PublicFeatureCardGrid>
            <PublicFeatureCard
              icon={IconArrowsShuffle}
              title="No two attempts the same"
              body="Questions are drawn at random from a larger pool and shuffled, and an attempt will not start unless the pool is big enough."
            />
            <PublicFeatureCard
              icon={IconClock}
              title="A time limit that holds"
              body="The candidate sees a countdown, and answers sent after the limit are refused by the server, not just discouraged."
            />
            <PublicFeatureCard
              icon={IconLock}
              title="Exam conditions"
              body="Leaving the exam page is blocked, and closing or reloading the tab warns first. A candidate can still end early and submit."
            />
            <PublicFeatureCard
              icon={IconPhoto}
              title="Image-based questions"
              body="Questions can show clinical images side by side, so the candidate judges what they would see in practice."
            />
            <PublicFeatureCard
              icon={IconShieldCheck}
              title="Scoring that fails safe"
              body="An unknown or misconfigured scoring rule counts as a fail, never a pass."
            />
          </PublicFeatureCardGrid>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Results you can stand behind"
              size="md"
              c="white"
            />
          </Stack>
          <PublicFeatureCardGrid>
            <PublicFeatureCard
              icon={IconStack2}
              title="Tied to the exact questions"
              body="Every attempt records the version of the question bank it was sat against. A live assessment only changes with a new version, which an administrator chooses to adopt."
            />
            <PublicFeatureCard
              icon={IconCertificate}
              title="Certificates on a pass"
              body="A certificate with a unique exam reference, ready to download straight away and emailed to the candidate and the course coordinator."
            />
            <PublicFeatureCard
              icon={IconChartBar}
              title="A record for the coordinator"
              body="Coordinators see each delegate's latest result, how many have passed and the first-time pass rate."
            />
          </PublicFeatureCardGrid>
        </Container>
      </PublicLightBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
