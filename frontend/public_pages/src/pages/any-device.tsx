import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicButton from "@/components/button/PublicButton";
import { PublicFeatureCard } from "@/components/feature-card/PublicFeatureCard";
import PublicFeatureCardGrid from "@/components/feature-card/PublicFeatureCardGrid";
import {
  IconDeviceLaptop,
  IconDeviceMobile,
  IconMoon,
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
            <PublicTitle title="Install it on *any* device" />
            <PublicBodyText justify="centre">
              Quill Medical runs in the web browser, and installs like an app on
              a Mac, a Windows PC, a tablet or a smartphone. There is no app
              store to go through, and nothing to download beyond the browser
              you already have.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <PublicFeatureCardGrid>
            <PublicFeatureCard
              icon={IconDeviceLaptop}
              title="Mac and Windows"
              body="Install it from Chrome, Edge or Safari, and it opens in its own window from the dock or Start menu."
            />
            <PublicFeatureCard
              icon={IconDeviceMobile}
              title="Phones and tablets"
              body="Add it to the home screen on an iPhone, iPad or Android device, and it opens full screen like any other app."
            />
            <PublicFeatureCard
              icon={IconMoon}
              title="Light or dark"
              body="Read in light or dark mode, on a large screen or a small one."
            />
          </PublicFeatureCardGrid>
          <Stack align="center" gap="md" py="xl">
            <PublicBodyText justify="centre">
              Sign in from any device to get started.
            </PublicBodyText>
            <Group justify="center">
              <PublicButton href="https://app.quill-medical.com">
                Log in
              </PublicButton>
            </Group>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
