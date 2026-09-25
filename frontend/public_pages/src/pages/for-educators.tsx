import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import PublicButton from "@/components/button/PublicButton";
import { PublicFeatureCard } from "@/components/feature-card/PublicFeatureCard";
import PublicFeatureCardGrid from "@/components/feature-card/PublicFeatureCardGrid";
import {
  IconCertificate,
  IconChartBar,
  IconStack2,
} from "@/components/icons/appIcons";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Group, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="For *educators*" />
            <PublicBodyText justify="centre">
              Run an assessment with confidence in every result, and see how
              your delegates are doing without chasing spreadsheets.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <PublicFeatureCardGrid>
            <PublicFeatureCard
              icon={IconStack2}
              title="Version-locked question banks"
              body="Every attempt records the version of the question bank it was sat against. Your organisation moves to a new version only when an administrator chooses to."
            />
            <PublicFeatureCard
              icon={IconChartBar}
              title="Your delegates' results"
              body="See each delegate's latest result, how many have passed and the first-time pass rate, for your own organisation."
            />
            <PublicFeatureCard
              icon={IconCertificate}
              title="Certificates to the coordinator"
              body="When a delegate passes, their certificate is emailed to them and to the course coordinator."
            />
          </PublicFeatureCardGrid>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Talk to us about your module"
              size="md"
              c="white"
            />
            <PublicBodyText justify="centre">
              More modules are on the way. If you teach or assess clinicians and
              would like to build one together, we would like to hear from you.
            </PublicBodyText>
            <Group mt="lg" justify="center">
              <PublicButton href="/contact">Contact us</PublicButton>
            </Group>
          </Stack>
        </Container>
      </PublicLightBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
