import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import PublicButton from "@/components/button/PublicButton";
import { PublicFeatureCard } from "@/components/feature-card/PublicFeatureCard";
import PublicFeatureCardGrid from "@/components/feature-card/PublicFeatureCardGrid";
import {
  IconArrowsShuffle,
  IconBook,
  IconCertificate,
  IconPhoto,
} from "@/components/icons/appIcons";
import EoeetaLogo from "@/components/images/EoeetaLogo";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Box, Container, Group, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <EoeetaLogo height={8} />
            <PublicTitle title="Optical diagnosis accreditation for *every* colonoscopist" />
            <PublicBodyText justify="centre">
              Call small polyps confidently and correctly. An online module in
              optical diagnosis of diminutive colorectal polyps, built with the
              East of England Endoscopy Training Academy (EoEETA).
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Closing the gap" size="md" c="white" />
            <PublicBodyText justify="centre">
              Accreditation in optical diagnosis has covered colonoscopists in
              the bowel cancer screening programme. This assessment extends it
              to symptomatic colonoscopists, so every colonoscopist can show
              they call small polyps accurately.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="How it works" size="md" c="white" />
          </Stack>
          <PublicFeatureCardGrid>
            <PublicFeatureCard
              icon={IconBook}
              title="Learn first"
              body="A learning module covers polyp classification and the features seen under narrow band imaging, with lectures and captioned video."
            />
            <PublicFeatureCard
              icon={IconPhoto}
              title="Real images"
              body="Each question shows the same polyp under white light and narrow band imaging, side by side, as it is seen in the room."
            />
            <PublicFeatureCard
              icon={IconArrowsShuffle}
              title="A fair assessment"
              body="Questions are drawn at random from a larger pool and the assessment is timed, so no two attempts are the same."
            />
            <PublicFeatureCard
              icon={IconCertificate}
              title="A certificate on a pass"
              body="A certificate with a unique reference, sent in EoEETA's name to the candidate and to the course coordinator."
            />
          </PublicFeatureCardGrid>
        </Container>
      </PublicDarkBackground>

      {/* Screenshots of the module go here, as their own section, once
          they are chosen and cleared with EoEETA. */}

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Their teaching, our platform"
              size="md"
              c="white"
            />
            <Box mb="sm">
              <PublicBodyText justify="centre">
                The clinical content is EoEETA's: the teaching, the polyp images
                and the questions. Quill is the platform that delivers it, so
                the academy can spend its time on what to teach and what a pass
                should mean, not on how to run an exam online.
              </PublicBodyText>
            </Box>
            <PublicBodyText justify="centre">
              EoEETA's coordinators see each delegate's latest result, how many
              have passed and the first-time pass rate, and every result is tied
              to the exact version of the question bank it was sat against.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Taking part" size="md" c="white" />
            <PublicBodyText justify="centre">
              Colonoscopists join the module through EoEETA. If you have already
              registered, log in to start. If you teach or assess clinicians and
              would like to build a module of your own, we would like to hear
              from you.
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
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
