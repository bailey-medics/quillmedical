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
            <PublicTitle title="Optical diagnosis accreditation for *every* colonoscopist" />
            <PublicBodyText justify="centre">
              Call small polyps confidently and correctly. An online assessment
              of optical diagnosis of diminutive colorectal polyps, built with
              the East of England Endoscopy Training Academy (EoEETA).
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
              body="A learning module covers polyp classification and the features seen under narrow band imaging, with lectures and video."
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
              body="A certificate with a unique reference, emailed to the candidate and to the course coordinator."
            />
          </PublicFeatureCardGrid>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Taking part" size="md" c="white" />
            <PublicBodyText justify="centre">
              Colonoscopists join the assessment through EoEETA. If you have
              already registered, log in to start.
            </PublicBodyText>
            <Group mt="lg" justify="center">
              <PublicButton href="https://app.quill-medical.com">
                Log in
              </PublicButton>
            </Group>
          </Stack>
        </Container>
      </PublicLightBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
