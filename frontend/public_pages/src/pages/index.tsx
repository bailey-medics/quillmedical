import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import PublicButton from "@/components/button/PublicButton";
import { PublicFeatureCard } from "@/components/feature-card/PublicFeatureCard";
import PublicFeatureCardGrid from "@/components/feature-card/PublicFeatureCardGrid";
import PublicInfoCard from "@/components/info-card/PublicInfoCard";
import PublicLayout from "@/components/layouts/PublicLayout";
import QuillLogo from "@/components/images/QuillLogo";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Box, Container, Group, SimpleGrid, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { IconChalkboardTeacher, IconDatabase } from "@tabler/icons-react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" justify="center" style={{ minHeight: "60dvh" }}>
            <QuillLogo height={8} colour="light-grey" />
            <PublicTitle title="Communication that counts!" />
            <PublicBodyText justify="centre">
              Exceptional clinical care deserves exceptional clinical tools.
              Software your team actually wants to use, and trainees who walk
              into any clinical setting knowing exactly what they're doing.
              Quill Medical is what a clinical team builds when they refuse to
              settle - for trainees across every specialty, and the clinicians
              who teach them.
            </PublicBodyText>
            <Group mt="lg" justify="center">
              <PublicButton href="https://app.quill-medical.com">
                Log in
              </PublicButton>
            </Group>
          </Stack>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" mt="xl">
            <PublicInfoCard
              label="Architecture"
              heading="FHIR R4"
              description="HL7-compliant data layer"
            />
            <PublicInfoCard
              label="Assessments"
              heading="Version-locked"
              description="Every result traceable to the questions sat"
            />
            <PublicInfoCard
              label="Data residency"
              heading="UK hosted"
              description="Your data stays in the UK"
            />
          </SimpleGrid>
        </Container>
      </PublicHeroBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Built by clinicians *for* clinicians!"
              c="white"
            />
            <Box mb="sm">
              <PublicBodyText justify="centre">
                Great clinical care has always depended on great clinical
                judgement. We believe it should also have great clinical tools
                to match - tools that support that judgement, surface the right
                information at the right moment, and get out of the way.
              </PublicBodyText>
            </Box>
            <PublicBodyText justify="centre">
              The Quill team brings something rare to software development:
              genuine clinical experience. We have trained, examined, referred,
              prescribed, and taught. We know what good looks like at the
              bedside, and we build towards it. That is our commitment — to keep
              raising the standard of what clinical software can be, one
              carefully considered feature at a time.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="What we *build*" c="white" />
            <PublicBodyText justify="centre">
              Online learning and assessment for clinicians, and a clinical
              record built on the same foundations.
            </PublicBodyText>
          </Stack>
          <PublicFeatureCardGrid>
            <PublicFeatureCard
              icon={IconChalkboardTeacher}
              title="Learning and assessment"
              body="Learning modules and fair, timed assessments, with a certificate on a pass."
              href="/clinical-teaching"
            />
            <PublicFeatureCard
              icon={IconDatabase}
              title="Clinical records"
              body="A clinical record on open standards, in development. Talk to us about early access."
              href="/clinical-records"
            />
          </PublicFeatureCardGrid>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
