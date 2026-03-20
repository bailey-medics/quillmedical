import HeroBackground from "@/components/background/HeroBackground";
import HeroBackgroundLight from "@/components/background/HeroBackgroundLight";
import PublicButton from "@/components/button/PublicButton";
import PublicLayout from "@/components/layouts/PublicLayout";
import QuillLogo from "@/components/images/QuillLogo";
import PublicTitle from "@/components/page-header/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { theme } from "@/theme";
import { Container, Group, MantineProvider, Stack } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <HeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" justify="center" style={{ minHeight: "60dvh" }}>
            <QuillLogo
              height={8}
              style={{ filter: "brightness(0) invert(1)" }}
            />
            <PublicTitle title="Communication that Counts!" />
            <PublicText size="lg">
              Exceptional clinical care deserves exceptional clinical tools.
              Software your team actually wants to use, and trainees who walk
              into any clinical setting knowing exactly what they're doing.
              Quill Medical is what a clinical team builds when they refuse to
              settle - for trainees across every specialty, and the clinicians
              who teach them.
            </PublicText>
            <Group mt="lg">
              <PublicButton href="https://teaching.quill-medical.com">
                Teaching
              </PublicButton>
              <PublicButton href="https://staging.quill-medical.com">
                EPR Staging
              </PublicButton>
              <PublicButton variant="outline" disabled>
                EPR Live
              </PublicButton>
            </Group>
          </Stack>
        </Container>
      </HeroBackground>

      <HeroBackgroundLight>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Built for clinicians" size="md" />
            <PublicText>
              Quill Medical is designed from the ground up by clinicians who
              understand the pressures of modern healthcare. Every feature is
              shaped by real clinical workflows — not assumptions.
            </PublicText>
          </Stack>
        </Container>
      </HeroBackgroundLight>
    </PublicLayout>
  </MantineProvider>,
);
