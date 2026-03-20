import DarkBackground from "@/components/background/DarkBackground";
import HeroBackground from "@/components/background/HeroBackground";
import LightBackground from "@/components/background/LightBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/page-header/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { theme } from "@/theme";
import { Container, MantineProvider, Stack } from "@mantine/core";
import "@mantine/core/styles.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <HeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="About Quill Medical" />
            <PublicText size="lg">
              Quill Medical is a clinician-led software company building the
              tools that clinical teams actually need. We started because we
              believed healthcare technology could be better — more thoughtful,
              more aligned with how clinicians really work, and built on open
              standards that put patients and providers first.
            </PublicText>
          </Stack>
        </Container>
      </HeroBackground>

      <LightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Built by clinicians" c="white" />
            <PublicText size="lg">
              Our team brings genuine clinical experience to every line of code.
              We have trained, examined, referred, prescribed, and taught. We
              know the frustration of systems that slow you down when you need
              to move fast, and the quiet satisfaction of a tool that just works
              at the bedside.
            </PublicText>
            <PublicText size="lg">
              That clinical insight shapes every decision — from the data
              architecture (FHIR R4, OpenEHR) to the access model
              (competency-based, not role-based) to the deployment philosophy
              (modular, so you only run what you need).
            </PublicText>
          </Stack>
        </Container>
      </LightBackground>

      <DarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Our commitment" c="white" />
            <PublicText size="lg">
              We are committed to clinical safety (DCB 0129 certified), data
              sovereignty (UK/EU hosted on GCP European region), and open
              standards that prevent vendor lock-in. Your data remains yours,
              portable and interoperable.
            </PublicText>
            <PublicText size="lg">
              Quill is what a clinical team builds when they refuse to settle.
              Every feature is carefully considered, clinically validated, and
              built to the standard that patients deserve and clinicians expect.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
