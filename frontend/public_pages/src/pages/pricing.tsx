import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import PublicButton from "@/components/button/PublicButton";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { theme } from "@/theme";
import { Container, Group, MantineProvider, Stack } from "@mantine/core";
import "../global-styles";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Pricing" />
            <PublicText size="lg">
              Quill Medical is currently in active development. We are building
              something we believe will genuinely improve clinical workflows —
              and we want to get it right before we put a price on it.
            </PublicText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="App coming soon" c="white" />
            <PublicText size="lg">
              We are working towards a production release that meets the
              standards clinical teams deserve — clinically safe, rigorously
              tested, and built on open healthcare standards. Pricing details
              will be published when the platform is ready for general
              availability.
            </PublicText>
            <PublicText size="lg">
              In the meantime, you can explore the teaching platform to see what
              we are building.
            </PublicText>
            <Group mt="lg">
              <PublicButton href="https://teaching.quill-medical.com">
                Try Teaching
              </PublicButton>
            </Group>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Get in touch" c="white" />
            <PublicText size="lg">
              Interested in early access or want to discuss how Quill could work
              for your organisation? We would love to hear from you. Head over
              to our contact page and let us know.
            </PublicText>
            <Group mt="lg">
              <PublicButton href="/contact.html">Contact us</PublicButton>
            </Group>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
