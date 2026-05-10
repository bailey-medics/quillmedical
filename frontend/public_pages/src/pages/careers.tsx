import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
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
            <PublicTitle title="Careers at Quill Medical" />
            <PublicBodyText justify="centre">
              We are building the future of clinical software — thoughtful,
              safe, and grounded in real clinical experience. If you care about
              healthcare and want to build technology that genuinely helps
              clinicians and patients, we would love to hear from you.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Why join us?" c="white" />
            <PublicBodyText justify="centre">
              Quill Medical is a clinician-led company. We combine deep clinical
              knowledge with modern engineering to build tools that work the way
              healthcare teams actually think. You will work alongside
              clinicians who have practised at the bedside and engineers who
              care about getting the details right.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              We value open standards (FHIR R4, OpenEHR), clinical safety, and
              code quality. Every feature is carefully considered and built to
              the standard that patients deserve.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Open positions" c="white" />
            <PublicBodyText justify="centre">
              We do not have any open positions at the moment, but we are always
              interested in hearing from talented people who share our mission.
              If you are a clinician, engineer, designer, or someone who
              believes healthcare technology can be better, please get in touch
              via our contact page.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
