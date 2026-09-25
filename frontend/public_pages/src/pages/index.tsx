import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import PublicButton from "@/components/button/PublicButton";
import { PublicFeatureCard } from "@/components/feature-card/PublicFeatureCard";
import PublicFeatureCardGrid from "@/components/feature-card/PublicFeatureCardGrid";
import {
  IconAccessible,
  IconArrowsShuffle,
  IconCertificate,
  IconChartBar,
  IconPresentation,
  IconShieldCheck,
} from "@/components/icons/appIcons";
import PublicInfoCard from "@/components/info-card/PublicInfoCard";
import PublicLayout from "@/components/layouts/PublicLayout";
import QuillLogo from "@/components/images/QuillLogo";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Box, Container, Group, SimpleGrid, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" justify="center" style={{ minHeight: "60dvh" }}>
            <QuillLogo height={8} colour="light-grey" />
            <PublicTitle title="Clinical learning and assessment, done *properly*" />
            <PublicBodyText justify="centre">
              Online learning and assessment for clinicians, built by
              clinicians. Assessments that are fair, secure, accessible and set
              to the standard the specialty expects, with the learning that
              prepares for them beside each one.
            </PublicBodyText>
            <Group mt="lg" justify="center">
              <PublicButton href="https://app.quill-medical.com">
                Log in
              </PublicButton>
              <PublicButton href="/contact" variant="outline">
                Talk to us
              </PublicButton>
            </Group>
          </Stack>
          <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg" mt="xl">
            <PublicInfoCard
              label="Data residency"
              heading="UK hosted"
              description="Your data stays in the UK"
            />
            <PublicInfoCard
              label="Assessments"
              heading="Traceable"
              description="Every result tied to the exact version of the questions sat"
            />
            <PublicInfoCard
              label="Accessibility"
              heading="Accessible"
              description="Designed for low vision, and working towards WCAG 2.2 AA"
            />
          </SimpleGrid>
        </Container>
      </PublicHeroBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Optical diagnosis accreditation for *every* colonoscopist"
              size="md"
              c="white"
            />
            <PublicBodyText justify="centre">
              Call small polyps confidently and correctly. Our first module,
              built with the East of England Endoscopy Training Academy
              (EoEETA), assesses optical diagnosis of diminutive colorectal
              polyps, and extends accreditation beyond the bowel cancer
              screening programme to symptomatic colonoscopists.
            </PublicBodyText>
            <Group mt="lg" justify="center">
              <PublicButton href="/optical-diagnosis">
                About the module
              </PublicButton>
            </Group>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Built by clinicians *for* clinicians"
              size="md"
              c="white"
            />
            <Box mb="sm">
              <PublicBodyText justify="centre">
                Great clinical care has always depended on great clinical
                judgement, and on the teaching and assessment that build it. We
                believe that deserves tools to match: fair to the people being
                assessed, trustworthy for the people signing them off, and out
                of the way of both.
              </PublicBodyText>
            </Box>
            <PublicBodyText justify="centre">
              The Quill team brings genuine clinical experience to software. We
              have trained, examined and taught, and we know what a good
              assessment looks like from both sides of the desk.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <PublicFeatureCardGrid>
            <PublicFeatureCard
              icon={IconArrowsShuffle}
              title="Fair assessments"
              body="Questions drawn at random from a larger pool, a time limit the server enforces, and exam conditions in the browser."
              href="/assessments"
            />
            <PublicFeatureCard
              icon={IconCertificate}
              title="Certificates"
              body="A certificate with a unique reference on a pass, emailed to the candidate and the course coordinator."
              href="/assessments"
            />
            <PublicFeatureCard
              icon={IconPresentation}
              title="Learning modules"
              body="Slide-based learning with captioned video, beside the assessment it prepares for."
              href="/learning"
            />
            <PublicFeatureCard
              icon={IconAccessible}
              title="Accessibility"
              body="A typeface designed for low vision, strong contrast and full keyboard use, with automated checks on every change."
              href="/accessibility"
            />
            <PublicFeatureCard
              icon={IconChartBar}
              title="For educators"
              body="Version-locked question banks, and every delegate's latest result in one place."
              href="/for-educators"
            />
            <PublicFeatureCard
              icon={IconShieldCheck}
              title="Security"
              body="Hosted in the UK, security tested on every change, and strong sign-in."
              href="/security"
            />
          </PublicFeatureCardGrid>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="What's next" size="md" c="white" />
            <PublicBodyText justify="centre">
              More modules are on the way, built with clinical teams. If you
              would like to build one together, get in touch.
            </PublicBodyText>
            <Group mt="lg" justify="center">
              <PublicButton href="/contact">Contact us</PublicButton>
            </Group>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
