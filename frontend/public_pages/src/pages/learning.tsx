import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicButton from "@/components/button/PublicButton";
import { PublicFeatureCard } from "@/components/feature-card/PublicFeatureCard";
import PublicFeatureCardGrid from "@/components/feature-card/PublicFeatureCardGrid";
import {
  IconBadgeCc,
  IconDeviceMobile,
  IconPresentation,
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
            <PublicTitle title="Learning that sits *beside* the assessment" />
            <PublicBodyText justify="centre">
              Each module pairs its assessment with the learning that prepares
              for it, so a candidate can study and sit it in one place.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <PublicFeatureCardGrid>
            <PublicFeatureCard
              icon={IconPresentation}
              title="Slide-based modules"
              body="Figures, callouts and video, read one slide at a time with buttons, the arrow keys or a swipe."
            />
            <PublicFeatureCard
              icon={IconBadgeCc}
              title="Hosted, captioned video"
              body="Videos play smoothly, carry captions, and are served privately to signed-in learners on the module, not posted publicly."
            />
            <PublicFeatureCard
              icon={IconDeviceMobile}
              title="Works on a phone"
              body="Install it like an app, and read in light or dark mode."
            />
          </PublicFeatureCardGrid>
          <Stack align="center" gap="md" py="xl">
            <PublicBodyText justify="centre">
              See it in use in our first module, optical diagnosis of small
              colorectal polyps.
            </PublicBodyText>
            <Group justify="center">
              <PublicButton href="/optical-diagnosis">
                Optical diagnosis
              </PublicButton>
            </Group>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
